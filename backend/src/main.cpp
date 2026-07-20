#include <httplib.h>
#include <nlohmann/json.hpp>
#include "crypto_utils.hpp"

#if DESTEK_USE_POSTGRES
#include "sqlite_to_pq.hpp"
#else
#include <sqlite3.h>
#endif

#include <ctime>

#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <mutex>
#include <optional>
#include <random>
#include <sstream>
#include <string>
#include <unordered_map>

namespace fs = std::filesystem;
using json = nlohmann::json;

namespace {

std::string g_freshdesk_domain = "";
std::string g_freshdesk_apikey = "";

std::mutex g_db_mutex;
sqlite3 *g_db = nullptr;

std::mutex g_sessions_mutex;
std::unordered_map<std::string, int64_t> g_token_to_user;

struct SSEClient {
    int64_t user_id;
    std::vector<std::string> messages;
    bool active = true;
};
std::mutex g_sse_mutex;
std::vector<std::shared_ptr<SSEClient>> g_sse_clients;

void notify_user(int64_t user_id, const std::string& evt, const std::string& data) {
    std::lock_guard<std::mutex> lock(g_sse_mutex);
    std::string msg = "event: " + evt + "\ndata: " + data + "\n\n";
    for(auto& c : g_sse_clients) {
        if(c->user_id == user_id && c->active) {
            c->messages.push_back(msg);
        }
    }
}

void simulate_email(const std::string& to, const std::string& subject, const std::string& body) {
    std::cout << "\n================ EMAIL SENT ================\n"
              << "To: " << to << "\n"
              << "Subject: " << subject << "\n"
              << "Body:\n" << body << "\n"
              << "============================================\n\n";
}


#include <chrono>
struct ViewerInfo {
  std::string display_name;
  std::chrono::steady_clock::time_point last_seen;
};
std::mutex g_viewers_mutex;
std::map<int64_t, std::map<int64_t, ViewerInfo>> g_ticket_viewers;

// Brute-force protection
struct LoginAttempt {
  int count = 0;
  std::chrono::steady_clock::time_point first_attempt;
  std::chrono::steady_clock::time_point locked_until;
};
std::mutex g_login_mutex;
std::unordered_map<std::string, LoginAttempt> g_login_attempts;

std::string random_token() {
  static thread_local std::mt19937_64 rng{std::random_device{}()};
  std::uniform_int_distribution<int> dist(0, 15);
  const char *hex = "0123456789abcdef";
  std::string out;
  out.resize(48);
  for (char &c : out) c = hex[dist(rng)];
  return out;
}

void db_close() {
  if (g_db) {
    sqlite3_close(g_db);
    g_db = nullptr;
  }
}

int db_exec(const char *sql) {
  char *err = nullptr;
  int rc = sqlite3_exec(g_db, sql, nullptr, nullptr, &err);
  if (rc != SQLITE_OK) {
    std::cerr << "SQLite: " << (err ? err : "?") << "\n";
    sqlite3_free(err);
  }
  return rc;
}

void try_alter(const char *sql) {
  char *err = nullptr;
  sqlite3_exec(g_db, sql, nullptr, nullptr, &err);
  if (err) sqlite3_free(err);
}

struct AssigneeProgress {
  int total = 0;
  int completed = 0;
};

AssigneeProgress get_assignee_progress(int64_t ticket_id) {
  AssigneeProgress p;
  sqlite3_stmt *st = nullptr;
  const char *sql =
      "SELECT COUNT(*), COALESCE(SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END), 0) "
      "FROM ticket_assignees WHERE ticket_id = ?";
  if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) == SQLITE_OK) {
    sqlite3_bind_int64(st, 1, ticket_id);
    if (sqlite3_step(st) == SQLITE_ROW) {
      p.total = sqlite3_column_int(st, 0);
      p.completed = sqlite3_column_int(st, 1);
    }
    sqlite3_finalize(st);
  }
  return p;
}

std::string get_ticket_status(int64_t ticket_id) {
  std::string status;
  sqlite3_stmt *st = nullptr;
  if (sqlite3_prepare_v2(g_db, "SELECT status FROM tickets WHERE id = ?", -1, &st,
                         nullptr) == SQLITE_OK) {
    sqlite3_bind_int64(st, 1, ticket_id);
    if (sqlite3_step(st) == SQLITE_ROW) {
      const char *t = reinterpret_cast<const char *>(sqlite3_column_text(st, 0));
      if (t) status = t;
    }
    sqlite3_finalize(st);
  }
  return status;
}

void notify_managers_pending_close(int64_t ticket_id, const std::string &ts) {
  sqlite3_stmt *mst = nullptr;
  const char *msql = "SELECT id FROM users WHERE role IN ('manager', 'superuser')";
  if (sqlite3_prepare_v2(g_db, msql, -1, &mst, nullptr) == SQLITE_OK) {
    std::vector<int64_t> manager_ids;
    while (sqlite3_step(mst) == SQLITE_ROW) {
      manager_ids.push_back(sqlite3_column_int64(mst, 0));
    }
    sqlite3_finalize(mst);

    for (int64_t mid : manager_ids) {
      sqlite3_stmt *nst = nullptr;
      const char *nsql =
          "INSERT INTO notifications (user_id, message, created_at, link) VALUES (?, ?, ?, ?)";
      if (sqlite3_prepare_v2(g_db, nsql, -1, &nst, nullptr) == SQLITE_OK) {
        std::string msg =
            "#" + std::to_string(ticket_id) +
            " numaralı talepte tüm personel tamamladı — onayınız bekleniyor.";
        std::string link = "/app/talep/" + std::to_string(ticket_id);
        sqlite3_bind_int64(nst, 1, mid);
        sqlite3_bind_text(nst, 2, msg.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(nst, 3, ts.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(nst, 4, link.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_step(nst);
        sqlite3_finalize(nst);
      }
    }
  }
}

void set_ticket_pending_close(int64_t ticket_id, int64_t actor_id, const std::string &ts,
                              const std::string &history_action) {
  sqlite3_stmt *st = nullptr;
  const char *sql =
      "UPDATE tickets SET status = 'pending_close', updated_at = ? WHERE id = ? AND status NOT IN "
      "('closed', 'pending_close')";
  if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) == SQLITE_OK) {
    sqlite3_bind_text(st, 1, ts.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_int64(st, 2, ticket_id);
    sqlite3_step(st);
    sqlite3_finalize(st);
  }

  sqlite3_stmt *hst = nullptr;
  const char *hsql =
      "INSERT INTO ticket_history (ticket_id, user_id, action, created_at) VALUES (?, ?, ?, ?)";
  if (sqlite3_prepare_v2(g_db, hsql, -1, &hst, nullptr) == SQLITE_OK) {
    sqlite3_bind_int64(hst, 1, ticket_id);
    sqlite3_bind_int64(hst, 2, actor_id);
    sqlite3_bind_text(hst, 3, history_action.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(hst, 4, ts.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_step(hst);
    sqlite3_finalize(hst);
  }

  notify_managers_pending_close(ticket_id, ts);
}

void maybe_auto_pending_close(int64_t ticket_id, int64_t actor_id, const std::string &ts) {
  AssigneeProgress p = get_assignee_progress(ticket_id);
  if (p.total > 0 && p.completed == p.total) {
    std::string cur = get_ticket_status(ticket_id);
    if (cur == "open" || cur == "assigned") {
      set_ticket_pending_close(
          ticket_id, actor_id, ts,
          "Tüm atanan personel görevlerini tamamladı — yönetici onayı bekleniyor");
    }
  }
}

void init_db(const std::string &path) {
  if (sqlite3_open(path.c_str(), &g_db) != SQLITE_OK) {
    throw std::runtime_error("sqlite3_open failed");
  }
  db_exec(R"SQL(
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','superuser','support','manager')),
      user_type TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','assigned','closed','pending_close')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')),
      assignee_id INTEGER,
      photo_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      rating INTEGER,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(assignee_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS ticket_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(ticket_id) REFERENCES tickets(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      link TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS ticket_assignees (
      ticket_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      is_completed INTEGER DEFAULT 0,
      FOREIGN KEY(ticket_id) REFERENCES tickets(id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      PRIMARY KEY(ticket_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS ticket_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      is_internal INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(ticket_id) REFERENCES tickets(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      detail TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );
  )SQL");

  try_alter(R"SQL(
    CREATE TABLE IF NOT EXISTS ticket_assignees (
      ticket_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      is_completed INTEGER DEFAULT 0,
      FOREIGN KEY(ticket_id) REFERENCES tickets(id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      PRIMARY KEY(ticket_id, user_id)
    );
  )SQL");

  try_alter("ALTER TABLE users ADD COLUMN user_type TEXT DEFAULT ''");
  try_alter("ALTER TABLE tickets ADD COLUMN photo_path TEXT");
  try_alter("ALTER TABLE tickets ADD COLUMN resolved_at TEXT");
  try_alter("ALTER TABLE tickets ADD COLUMN rating INTEGER");
  try_alter("ALTER TABLE tickets ADD COLUMN category TEXT DEFAULT ''");
  try_alter("ALTER TABLE ticket_comments ADD COLUMN is_internal INTEGER DEFAULT 0");

  // Migrate old assignee_id data to ticket_assignees
  try_alter("INSERT INTO ticket_assignees (ticket_id, user_id, is_completed) SELECT id, assignee_id, 0 FROM tickets WHERE assignee_id IS NOT NULL ON CONFLICT DO NOTHING");

  sqlite3_stmt *st = nullptr;
  const char *count_sql = "SELECT COUNT(*) FROM users";
  if (sqlite3_prepare_v2(g_db, count_sql, -1, &st, nullptr) != SQLITE_OK)
    throw std::runtime_error("prepare failed");
  int n = 0;
  if (sqlite3_step(st) == SQLITE_ROW) n = sqlite3_column_int(st, 0);
  sqlite3_finalize(st);

  if (n == 0) {
    std::string s1 = crypto::hash_password("maltepe2026");
    std::string s2 = crypto::hash_password("super2026");
    
    sqlite3_stmt* is = nullptr;
    const char* isql = "INSERT INTO users (email, password, display_name, role) VALUES "
                       "('ogrenci@maltepe.edu.tr', ?, 'Demo Öğrenci', 'user'),"
                       "('destek@maltepe.edu.tr', ?, 'Demo Destek', 'superuser')";
    sqlite3_prepare_v2(g_db, isql, -1, &is, nullptr);
    sqlite3_bind_text(is, 1, s1.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(is, 2, s2.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_step(is);
    sqlite3_finalize(is);
  }
}

std::optional<std::string> bearer_token(const httplib::Request &req) {
  auto h = req.get_header_value("Authorization");
  const std::string prefix = "Bearer ";
  if (h.size() > prefix.size() && h.compare(0, prefix.size(), prefix) == 0)
    return h.substr(prefix.size());
  return std::nullopt;
}

struct UserRow {
  int64_t id = 0;
  std::string email;
  std::string display_name;
  std::string role;
  std::string user_type;
};

std::optional<UserRow> user_from_token(const std::string &token) {
  std::string secret = std::getenv("JWT_SECRET") ? std::getenv("JWT_SECRET") : "gizli_anahtar_degistir";
  std::string uid_str = crypto::verify_jwt(token, secret);
  if (uid_str.empty()) return std::nullopt;
  
  int64_t uid = 0;
  try {
      uid = std::stoll(uid_str);
  } catch(...) { return std::nullopt; }

  std::lock_guard<std::mutex> dblock(g_db_mutex);
  sqlite3_stmt *st = nullptr;
  const char *sql = "SELECT id, email, display_name, role, user_type FROM users WHERE id = ?";
  if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) != SQLITE_OK) return std::nullopt;
  sqlite3_bind_int64(st, 1, uid);
  std::optional<UserRow> out;
  if (sqlite3_step(st) == SQLITE_ROW) {
    UserRow u;
    u.id = sqlite3_column_int64(st, 0);
    u.email = reinterpret_cast<const char *>(sqlite3_column_text(st, 1));
    u.display_name = reinterpret_cast<const char *>(sqlite3_column_text(st, 2));
    u.role = reinterpret_cast<const char *>(sqlite3_column_text(st, 3));
    if (sqlite3_column_type(st, 4) != SQLITE_NULL) {
      u.user_type = reinterpret_cast<const char *>(sqlite3_column_text(st, 4));
    }
    out = u;
  }
  sqlite3_finalize(st);
  return out;
}

void set_cors(httplib::Response &res) {
  res.set_header("Access-Control-Allow-Origin", "*");
  res.set_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

json user_json(const UserRow &u) {
  return json{{"id", u.id},
              {"email", u.email},
              {"display_name", u.display_name},
              {"role", u.role},
              {"user_type", u.user_type}};
}

std::string now_iso() {
  std::time_t t = std::time(nullptr);
  char buf[32];
  std::strftime(buf, sizeof buf, "%Y-%m-%dT%H:%M:%SZ", std::gmtime(&t));
  return buf;
}

} // namespace

int main(int argc, char **argv) {
  std::string db_path = "";
  if (const char* env_db = std::getenv("DATABASE_URL")) {
    db_path = env_db;
  } else if (argc > 1) {
    db_path = argv[1];
  } else {
#if DESTEK_USE_POSTGRES
    std::cerr << "DATABASE_URL environment variable is required!\n";
    return 1;
#else
    db_path = "destek_mau.db";
#endif
  }

  if (const char* env_domain = std::getenv("FRESHDESK_DOMAIN")) {
    g_freshdesk_domain = env_domain;
  }
  if (const char* env_key = std::getenv("FRESHDESK_API_KEY")) {
    g_freshdesk_apikey = env_key;
  }

  try {
    init_db(db_path);
  } catch (const std::exception &e) {
    std::cerr << e.what() << "\n";
    return 1;
  }

  httplib::Server svr;

  svr.Options(".*", [](const httplib::Request &, httplib::Response &res) {
    set_cors(res);
    res.status = 204;
  });

  svr.Post("/api/login", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    json body;
    try {
      body = json::parse(req.body);
    } catch (...) {
      res.status = 400;
      res.set_content(json{{"error", "invalid_json"}}.dump(), "application/json");
      return;
    }
    std::string email = body.value("email", "");
    std::string password = body.value("password", "");
    if (email.empty() || password.empty()) {
      res.status = 400;
      res.set_content(json{{"error", "email_and_password_required"}}.dump(),
                      "application/json");
      return;
    }

    // Brute-force check
    {
      std::lock_guard<std::mutex> bflock(g_login_mutex);
      auto it = g_login_attempts.find(email);
      if (it != g_login_attempts.end()) {
        auto now = std::chrono::steady_clock::now();
        if (it->second.count >= 5 && now < it->second.locked_until) {
          auto remaining = std::chrono::duration_cast<std::chrono::minutes>(it->second.locked_until - now).count();
          res.status = 429;
          res.set_content(json{{"error", "account_locked"}, {"minutes_remaining", remaining}}.dump(), "application/json");
          return;
        }
        // Reset if lock expired
        if (it->second.count >= 5 && now >= it->second.locked_until) {
          g_login_attempts.erase(it);
        }
      }
    }

    std::lock_guard<std::mutex> dblock(g_db_mutex);
    sqlite3_stmt *st = nullptr;
    const char *sql =
        "SELECT id, email, display_name, role, user_type, password FROM users WHERE email = ?";
    if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) != SQLITE_OK) {
      res.status = 500;
      return;
    }
    sqlite3_bind_text(st, 1, email.c_str(), -1, SQLITE_TRANSIENT);

    std::optional<UserRow> u;
    std::string db_hash;
    if (sqlite3_step(st) == SQLITE_ROW) {
      UserRow row;
      row.id = sqlite3_column_int64(st, 0);
      row.email = reinterpret_cast<const char *>(sqlite3_column_text(st, 1));
      row.display_name = reinterpret_cast<const char *>(sqlite3_column_text(st, 2));
      row.role = reinterpret_cast<const char *>(sqlite3_column_text(st, 3));
      if (sqlite3_column_type(st, 4) != SQLITE_NULL) {
        row.user_type = reinterpret_cast<const char *>(sqlite3_column_text(st, 4));
      }
      db_hash = reinterpret_cast<const char *>(sqlite3_column_text(st, 5));
      u = row;
    }
    sqlite3_finalize(st);

    if (!u || !crypto::verify_password(password, db_hash)) {
      // Brute-force: increment failed attempts
      {
        std::lock_guard<std::mutex> bflock(g_login_mutex);
        auto &att = g_login_attempts[email];
        auto now = std::chrono::steady_clock::now();
        if (att.count == 0) att.first_attempt = now;
        att.count++;
        if (att.count >= 5) {
          att.locked_until = now + std::chrono::minutes(15);
        }
      }
      // Audit log
      {
        sqlite3_stmt *ast = nullptr;
        const char *asql = "INSERT INTO audit_log (user_id, action, detail, ip_address, created_at) VALUES (?, ?, ?, ?, ?)";
        if (sqlite3_prepare_v2(g_db, asql, -1, &ast, nullptr) == SQLITE_OK) {
          int64_t uid = u ? u->id : 0;
          sqlite3_bind_int64(ast, 1, uid);
          sqlite3_bind_text(ast, 2, "login_failed", -1, SQLITE_STATIC);
          sqlite3_bind_text(ast, 3, email.c_str(), -1, SQLITE_TRANSIENT);
          sqlite3_bind_text(ast, 4, req.remote_addr.c_str(), -1, SQLITE_TRANSIENT);
          std::string ts = now_iso();
          sqlite3_bind_text(ast, 5, ts.c_str(), -1, SQLITE_TRANSIENT);
          sqlite3_step(ast);
          sqlite3_finalize(ast);
        }
      }
      res.status = 401;
      res.set_content(json{{"error", "invalid_credentials"}}.dump(), "application/json");
      return;
    }

    // Clear brute-force counter on successful login
    {
      std::lock_guard<std::mutex> bflock(g_login_mutex);
      g_login_attempts.erase(email);
    }

    // Audit log successful login
    {
      sqlite3_stmt *ast = nullptr;
      const char *asql = "INSERT INTO audit_log (user_id, action, detail, ip_address, created_at) VALUES (?, ?, ?, ?, ?)";
      if (sqlite3_prepare_v2(g_db, asql, -1, &ast, nullptr) == SQLITE_OK) {
        sqlite3_bind_int64(ast, 1, u->id);
        sqlite3_bind_text(ast, 2, "login_success", -1, SQLITE_STATIC);
        sqlite3_bind_text(ast, 3, email.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(ast, 4, req.remote_addr.c_str(), -1, SQLITE_TRANSIENT);
        std::string ts = now_iso();
        sqlite3_bind_text(ast, 5, ts.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_step(ast);
        sqlite3_finalize(ast);
      }
    }

    std::string secret = std::getenv("JWT_SECRET") ? std::getenv("JWT_SECRET") : "gizli_anahtar_degistir";
    std::string token = crypto::create_jwt(u->id, u->role, secret);

    json out{{"token", token}, {"user", user_json(*u)}};
    res.set_content(out.dump(), "application/json");
  });

  svr.Get("/api/stream", [](const httplib::Request &req, httplib::Response &res) {
    auto tok = req.get_param_value("token");
    if(tok.empty()) {
        auto htok = bearer_token(req);
        if(htok) tok = *htok;
    }
    if (tok.empty()) {
      res.status = 401; return;
    }
    auto me = user_from_token(tok);
    if (!me) {
      res.status = 401; return;
    }

    auto client = std::make_shared<SSEClient>();
    client->user_id = me->id;
    {
        std::lock_guard<std::mutex> lock(g_sse_mutex);
        g_sse_clients.push_back(client);
    }

    res.set_header("Access-Control-Allow-Origin", "*");
    res.set_header("Content-Type", "text/event-stream");
    res.set_header("Cache-Control", "no-cache");
    res.set_header("Connection", "keep-alive");

    res.set_content_provider("text/event-stream", [client](size_t offset, httplib::DataSink &sink) {
        std::string payload;
        {
            std::lock_guard<std::mutex> lock(g_sse_mutex);
            if (!client->messages.empty()) {
                for (const auto& m : client->messages) payload += m;
                client->messages.clear();
            }
        }
        if (!payload.empty()) {
            sink.write(payload.c_str(), payload.size());
        } else {
            sink.write(": keepalive\n\n", 13);
            std::this_thread::sleep_for(std::chrono::seconds(1));
        }
        return client->active;
    }, [client](bool is_success) {
        std::lock_guard<std::mutex> lock(g_sse_mutex);
        client->active = false;
    });
  });

  svr.Get("/api/analytics", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) { res.status = 401; return; }
    auto me = user_from_token(*tok);
    if (!me || (me->role != "superuser" && me->role != "manager")) {
      res.status = 403; return;
    }

    std::lock_guard<std::mutex> dblock(g_db_mutex);
    json out;
    sqlite3_stmt *st = nullptr;
    
    if (sqlite3_prepare_v2(g_db, "SELECT status, COUNT(*) FROM tickets GROUP BY status", -1, &st, nullptr) == SQLITE_OK) {
        json status_data;
        while(sqlite3_step(st) == SQLITE_ROW) {
            status_data[reinterpret_cast<const char*>(sqlite3_column_text(st, 0))] = sqlite3_column_int(st, 1);
        }
        out["by_status"] = status_data;
        sqlite3_finalize(st);
    }
    
    if (sqlite3_prepare_v2(g_db, "SELECT priority, COUNT(*) FROM tickets GROUP BY priority", -1, &st, nullptr) == SQLITE_OK) {
        json prio_data;
        while(sqlite3_step(st) == SQLITE_ROW) {
            prio_data[reinterpret_cast<const char*>(sqlite3_column_text(st, 0))] = sqlite3_column_int(st, 1);
        }
        out["by_priority"] = prio_data;
        sqlite3_finalize(st);
    }

    out["mttr_hours"] = 0;
    if (sqlite3_prepare_v2(g_db, "SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24) FROM tickets WHERE resolved_at IS NOT NULL", -1, &st, nullptr) == SQLITE_OK) {
        if(sqlite3_step(st) == SQLITE_ROW && sqlite3_column_type(st, 0) != SQLITE_NULL) {
            out["mttr_hours"] = sqlite3_column_double(st, 0);
        }
        sqlite3_finalize(st);
    }

    out["avg_rating"] = 0.0;
    if (sqlite3_prepare_v2(g_db, "SELECT AVG(rating) FROM tickets WHERE rating IS NOT NULL", -1, &st, nullptr) == SQLITE_OK) {
        if(sqlite3_step(st) == SQLITE_ROW && sqlite3_column_type(st, 0) != SQLITE_NULL) {
            out["avg_rating"] = sqlite3_column_double(st, 0);
        }
        sqlite3_finalize(st);
    }

    out["rating_distribution"] = json::object();
    if (sqlite3_prepare_v2(g_db, "SELECT rating, COUNT(*) FROM tickets WHERE rating IS NOT NULL GROUP BY rating", -1, &st, nullptr) == SQLITE_OK) {
        while (sqlite3_step(st) == SQLITE_ROW) {
            out["rating_distribution"][std::to_string(sqlite3_column_int(st, 0))] = sqlite3_column_int(st, 1);
        }
        sqlite3_finalize(st);
    }

    // Assignee stats
    out["by_assignee"] = json::array();
    const char* assignee_sql = R"(
      SELECT u.display_name, 
             SUM(CASE WHEN t.status IN ('open', 'assigned', 'pending_close') THEN 1 ELSE 0 END) as active,
             SUM(CASE WHEN t.status = 'closed' THEN 1 ELSE 0 END) as closed
      FROM users u
      JOIN ticket_assignees ta ON ta.user_id = u.id
      JOIN tickets t ON t.id = ta.ticket_id
      GROUP BY u.id
    )";
    if (sqlite3_prepare_v2(g_db, assignee_sql, -1, &st, nullptr) == SQLITE_OK) {
        while (sqlite3_step(st) == SQLITE_ROW) {
            out["by_assignee"].push_back({
                {"name", reinterpret_cast<const char*>(sqlite3_column_text(st, 0))},
                {"active", sqlite3_column_int(st, 1)},
                {"closed", sqlite3_column_int(st, 2)}
            });
        }
        sqlite3_finalize(st);
    }

    res.set_content(out.dump(), "application/json");
  });


  svr.Get("/api/me", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }
    auto u = user_from_token(*tok);
    if (!u) {
      res.status = 401;
      res.set_content(json{{"error", "not found"}}.dump(), "application/json");
      return;
    }
    res.set_content(user_json(*u).dump(), "application/json");
  });

  svr.Post("/api/me/password", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) { res.status = 401; return; }
    auto me = user_from_token(*tok);
    if (!me) { res.status = 401; return; }

    auto body = json::parse(req.body, nullptr, false);
    if (body.is_discarded() || !body.contains("current_password") || !body.contains("new_password")) {
      res.status = 400;
      res.set_content(json{{"error", "bad_request"}}.dump(), "application/json");
      return;
    }

    std::string cur_pass = body["current_password"];
    std::string new_pass = body["new_password"];

    std::lock_guard<std::mutex> dblock(g_db_mutex);
    sqlite3_stmt *st = nullptr;
    if (sqlite3_prepare_v2(g_db, "SELECT password_hash FROM users WHERE id = ?", -1, &st, nullptr) == SQLITE_OK) {
      sqlite3_bind_int64(st, 1, me->id);
      if (sqlite3_step(st) == SQLITE_ROW) {
        std::string db_hash = reinterpret_cast<const char*>(sqlite3_column_text(st, 0));
        std::string cur_hash = crypto::hash_password(cur_pass);
        if (db_hash != cur_hash) {
          sqlite3_finalize(st);
          res.status = 403;
          res.set_content(json{{"error", "wrong_password"}}.dump(), "application/json");
          return;
        }
      }
      sqlite3_finalize(st);
    }

    std::string new_hash = crypto::hash_password(new_pass);
    if (sqlite3_prepare_v2(g_db, "UPDATE users SET password_hash = ? WHERE id = ?", -1, &st, nullptr) == SQLITE_OK) {
      sqlite3_bind_text(st, 1, new_hash.c_str(), -1, SQLITE_STATIC);
      sqlite3_bind_int64(st, 2, me->id);
      sqlite3_step(st);
      sqlite3_finalize(st);
      res.status = 200;
      res.set_content(json{{"success", true}}.dump(), "application/json");
    } else {
      res.status = 500;
    }
  });

  svr.Get("/api/tickets", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }
    auto me = user_from_token(*tok);
    if (!me) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }

    std::string status_filter = req.get_param_value("status");
    std::lock_guard<std::mutex> dblock(g_db_mutex);

    std::string sql =
        "SELECT t.id, t.user_id, t.title, t.description, t.category, t.status, t.priority, "
        "t.photo_path, t.created_at, t.updated_at, "
        "u.display_name AS owner_name "
        "FROM tickets t JOIN users u ON u.id = t.user_id "
        "WHERE 1=1 ";
    if (me->role != "superuser" && me->role != "manager") {
      if (me->role == "support") {
        sql += "AND t.id IN (SELECT ticket_id FROM ticket_assignees WHERE user_id = ?) ";
      } else {
        sql += "AND t.user_id = ? ";
      }
    }
    if (!status_filter.empty() && status_filter != "all") {
      sql += "AND t.status = ? ";
    }
    sql += "ORDER BY datetime(t.created_at) DESC";

    sqlite3_stmt *st = nullptr;
    if (sqlite3_prepare_v2(g_db, sql.c_str(), -1, &st, nullptr) != SQLITE_OK) {
      res.status = 500;
      return;
    }
    int bind = 1;
    if (me->role != "superuser" && me->role != "manager") sqlite3_bind_int64(st, bind++, me->id);
    if (!status_filter.empty() && status_filter != "all")
      sqlite3_bind_text(st, bind++, status_filter.c_str(), -1, SQLITE_TRANSIENT);

    json arr = json::array();
    while (sqlite3_step(st) == SQLITE_ROW) {
      json item;
      item["id"] = sqlite3_column_int64(st, 0);
      item["user_id"] = sqlite3_column_int64(st, 1);
      item["title"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 2));
      item["description"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 3));
      if (sqlite3_column_type(st, 4) != SQLITE_NULL)
        item["category"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 4));
      else
        item["category"] = "";
      item["status"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 5));
      item["priority"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 6));
      if (sqlite3_column_type(st, 7) == SQLITE_NULL)
        item["photo_path"] = nullptr;
      else
        item["photo_path"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 7));
      item["created_at"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 8));
      item["updated_at"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 9));
      item["owner_name"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 10));
      
      // Fetch assignees
      sqlite3_stmt *ast = nullptr;
      std::string asql = "SELECT a.user_id, u.display_name, a.is_completed FROM ticket_assignees a JOIN users u ON u.id = a.user_id WHERE a.ticket_id = ?";
      json assignees = json::array();
      if (sqlite3_prepare_v2(g_db, asql.c_str(), -1, &ast, nullptr) == SQLITE_OK) {
        sqlite3_bind_int64(ast, 1, item["id"].get<int64_t>());
        while (sqlite3_step(ast) == SQLITE_ROW) {
            assignees.push_back({
                {"id", sqlite3_column_int64(ast, 0)},
                {"name", reinterpret_cast<const char *>(sqlite3_column_text(ast, 1))},
                {"is_completed", sqlite3_column_int(ast, 2) == 1}
            });
        }
        sqlite3_finalize(ast);
      }
      item["assignees"] = assignees;
      
      arr.push_back(item);
    }
    sqlite3_finalize(st);
    res.set_content(json{{"tickets", arr}}.dump(), "application/json");
  });

  svr.Post("/api/tickets", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }
    auto me = user_from_token(*tok);
    if (!me) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }

    json body;
    try {
      body = json::parse(req.body);
    } catch (...) {
      res.status = 400;
      res.set_content(json{{"error", "invalid_json"}}.dump(), "application/json");
      return;
    }
    std::string title = body.value("title", "");
    std::string description = body.value("description", "");
    std::string category = body.value("category", "");
    std::string priority = body.value("priority", "normal");
    std::string photo_path = body.value("photo_path", "");
    if (title.empty() || description.empty()) {
      res.status = 400;
      res.set_content(json{{"error", "title_and_description_required"}}.dump(),
                      "application/json");
      return;
    }
    if (priority != "low" && priority != "normal" && priority != "high")
      priority = "normal";

    std::string ts = now_iso();
    std::lock_guard<std::mutex> dblock(g_db_mutex);
    sqlite3_stmt *st = nullptr;
    const char *sql =
        "INSERT INTO tickets (user_id, title, description, category, status, priority, "
        "assignee_id, photo_path, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', ?, NULL, ?, ?, ?)";
    if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) != SQLITE_OK) {
      res.status = 500;
      return;
    }
    sqlite3_bind_int64(st, 1, me->id);
    sqlite3_bind_text(st, 2, title.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(st, 3, description.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(st, 4, category.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(st, 5, priority.c_str(), -1, SQLITE_TRANSIENT);
    if (!photo_path.empty()) {
        sqlite3_bind_text(st, 6, photo_path.c_str(), -1, SQLITE_TRANSIENT);
    } else {
        sqlite3_bind_null(st, 6);
    }
    sqlite3_bind_text(st, 7, ts.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(st, 8, ts.c_str(), -1, SQLITE_TRANSIENT);
    if (sqlite3_step(st) != SQLITE_DONE) {
      sqlite3_finalize(st);
      res.status = 500;
      return;
    }
    sqlite3_finalize(st);
    int64_t new_id = sqlite3_last_insert_rowid(g_db);

    sqlite3_stmt *hst = nullptr;
    const char *hsql = "INSERT INTO ticket_history (ticket_id, user_id, action, created_at) VALUES (?, ?, 'Talep Oluşturuldu', ?)";
    if (sqlite3_prepare_v2(g_db, hsql, -1, &hst, nullptr) == SQLITE_OK) {
      sqlite3_bind_int64(hst, 1, new_id);
      sqlite3_bind_int64(hst, 2, me->id);
      sqlite3_bind_text(hst, 3, ts.c_str(), -1, SQLITE_TRANSIENT);
      sqlite3_step(hst);
      sqlite3_finalize(hst);
    }
    notify_user(me->id, "ticket_created", std::to_string(new_id));
    simulate_email(me->email, "Talep Alındı #" + std::to_string(new_id), "Talebiniz başarıyla alındı: " + title);

    // Auto Assignment (6.1)
    {
      sqlite3_stmt *ast = nullptr;
      // Find the support user with the fewest active tickets
      const char *asql = "SELECT u.id FROM users u LEFT JOIN ticket_assignees ta ON u.id = ta.user_id LEFT JOIN tickets t ON t.id = ta.ticket_id AND t.status != 'closed' WHERE u.role = 'support' GROUP BY u.id ORDER BY COUNT(t.id) ASC LIMIT 1";
      if (sqlite3_prepare_v2(g_db, asql, -1, &ast, nullptr) == SQLITE_OK) {
        if (sqlite3_step(ast) == SQLITE_ROW) {
          int64_t least_busy_support_id = sqlite3_column_int64(ast, 0);
          sqlite3_finalize(ast);
          
          sqlite3_stmt *ast2 = nullptr;
          if (sqlite3_prepare_v2(g_db, "INSERT INTO ticket_assignees (ticket_id, user_id, is_completed) VALUES (?, ?, 0)", -1, &ast2, nullptr) == SQLITE_OK) {
            sqlite3_bind_int64(ast2, 1, new_id);
            sqlite3_bind_int64(ast2, 2, least_busy_support_id);
            sqlite3_step(ast2);
            sqlite3_finalize(ast2);

            // Set ticket status to assigned
            sqlite3_stmt *ast3 = nullptr;
            if (sqlite3_prepare_v2(g_db, "UPDATE tickets SET status = 'assigned' WHERE id = ?", -1, &ast3, nullptr) == SQLITE_OK) {
              sqlite3_bind_int64(ast3, 1, new_id);
              sqlite3_step(ast3);
              sqlite3_finalize(ast3);
            }

            // History for auto assign
            sqlite3_stmt *hst2 = nullptr;
            if (sqlite3_prepare_v2(g_db, "INSERT INTO ticket_history (ticket_id, user_id, action, created_at) VALUES (?, ?, 'Sistem tarafından otomatik atandı', ?)", -1, &hst2, nullptr) == SQLITE_OK) {
              sqlite3_bind_int64(hst2, 1, new_id);
              sqlite3_bind_int64(hst2, 2, least_busy_support_id); // The one who got assigned? Or the creator?
              sqlite3_bind_text(hst2, 3, ts.c_str(), -1, SQLITE_TRANSIENT);
              sqlite3_step(hst2);
              sqlite3_finalize(hst2);
            }
          }
        } else {
          sqlite3_finalize(ast);
        }
      }
    }

    // Webhook Notification (6.3)
    {
        std::string webhook_url = "https://discord.com/api/webhooks/dummy_id/dummy_token";
        std::cout << "[WEBHOOK] POST " << webhook_url << " -> Yeni Talep: " << title << std::endl;
        // Mock webhook implementation for Phase 3
    }

    // --- Freshdesk Integration ---
    if (!g_freshdesk_domain.empty() && !g_freshdesk_apikey.empty()) {
      int fd_priority = 1; // 1: Low in Freshdesk
      if (priority == "normal") fd_priority = 2; // Medium
      else if (priority == "high") fd_priority = 3; // High

      json fd_payload = {
          {"description", description},
          {"subject", title},
          {"email", me->email},
          {"priority", fd_priority},
          {"status", 2} // 2: Open in Freshdesk
      };
      std::string fd_json = fd_payload.dump();
      
      // Escape single quotes for shell literal
      std::string safe_json;
      for (char c : fd_json) {
          if (c == '\'') safe_json += "'\\''";
          else safe_json += c;
      }
      
      std::string cmd = "curl -s -u \"" + g_freshdesk_apikey + ":X\" -H \"Content-Type: application/json\" -d '" + safe_json + "' -X POST \"https://" + g_freshdesk_domain + ".freshdesk.com/api/v2/tickets\" > /dev/null 2>&1 &";
      std::system(cmd.c_str());
    }
    // -----------------------------

    json out{{"id", new_id}, {"status", "created"}};
    res.status = 201;
    res.set_content(out.dump(), "application/json");
  });

  svr.Patch(R"(/api/tickets/(\d+))",
            [](const httplib::Request &req, httplib::Response &res) {
              set_cors(res);
              auto tok = bearer_token(req);
              if (!tok) {
                res.status = 401;
                res.set_content(json{{"error", "unauthorized"}}.dump(),
                                "application/json");
                return;
              }
              auto me = user_from_token(*tok);
              if (!me || (me->role != "superuser" && me->role != "manager" && me->role != "support")) {
                res.status = 403;
                res.set_content(json{{"error", "forbidden"}}.dump(), "application/json");
                return;
              }

              int64_t ticket_id = std::stoll(req.matches[1]);
              json body;
              try {
                body = json::parse(req.body);
              } catch (...) {
                res.status = 400;
                res.set_content(json{{"error", "invalid_json"}}.dump(),
                                "application/json");
                return;
              }

              std::lock_guard<std::mutex> dblock(g_db_mutex);

              sqlite3_stmt *chk = nullptr;
              int64_t ticket_owner_id = 0;
              if (sqlite3_prepare_v2(g_db, "SELECT id, user_id FROM tickets WHERE id = ?", -1,
                                     &chk, nullptr) != SQLITE_OK) {
                res.status = 500;
                return;
              }
              sqlite3_bind_int64(chk, 1, ticket_id);
              if (sqlite3_step(chk) != SQLITE_ROW) {
                sqlite3_finalize(chk);
                res.status = 404;
                res.set_content(json{{"error", "not_found"}}.dump(), "application/json");
                return;
              }
              ticket_owner_id = sqlite3_column_int64(chk, 1);
              sqlite3_finalize(chk);

              std::string ts = now_iso();

              if (body.contains("status")) {
                std::string stv = body["status"].get<std::string>();
                if (stv != "open" && stv != "assigned" && stv != "closed" && stv != "pending_close") {
                  res.status = 400;
                  res.set_content(json{{"error", "bad_status"}}.dump(), "application/json");
                  return;
                }
                
                if (stv == "closed" && me->role == "support") {
                  res.status = 403;
                  res.set_content(json{{"error", "admin_approval_required"}}.dump(), "application/json");
                  return;
                }

                if (stv == "closed") {
                  AssigneeProgress ap = get_assignee_progress(ticket_id);
                  if (ap.total > 0 && ap.completed < ap.total) {
                    res.status = 400;
                    res.set_content(
                        json{{"error", "assignees_incomplete"},
                             {"completed", ap.completed},
                             {"total", ap.total}}
                            .dump(),
                        "application/json");
                    return;
                  }
                }

                std::string extra_set = "";
                if (stv == "closed") {
                    extra_set = ", resolved_at = '" + ts + "'";
                }

                sqlite3_stmt *st = nullptr;
                std::string sql = "UPDATE tickets SET status = ?, updated_at = ?" + extra_set + " WHERE id = ?";
                if (sqlite3_prepare_v2(g_db, sql.c_str(), -1, &st, nullptr) != SQLITE_OK) {
                  res.status = 500;
                  return;
                }
                sqlite3_bind_text(st, 1, stv.c_str(), -1, SQLITE_TRANSIENT);
                sqlite3_bind_text(st, 2, ts.c_str(), -1, SQLITE_TRANSIENT);
                sqlite3_bind_int64(st, 3, ticket_id);
                sqlite3_step(st);
                sqlite3_finalize(st);

                if (stv == "closed") {
                  sqlite3_stmt *nst = nullptr;
                  const char *nsql = "INSERT INTO notifications (user_id, message, created_at, link) VALUES (?, ?, ?, ?)";
                  if (sqlite3_prepare_v2(g_db, nsql, -1, &nst, nullptr) == SQLITE_OK) {
                    std::string msg = "#" + std::to_string(ticket_id) + " numaralı talebiniz çözümlenerek kapatılmıştır.";
                    std::string link = "/app/tickets/" + std::to_string(ticket_id);
                    sqlite3_bind_int64(nst, 1, ticket_owner_id);
                    sqlite3_bind_text(nst, 2, msg.c_str(), -1, SQLITE_TRANSIENT);
                    sqlite3_bind_text(nst, 3, ts.c_str(), -1, SQLITE_TRANSIENT);
                    sqlite3_bind_text(nst, 4, link.c_str(), -1, SQLITE_TRANSIENT);
                    sqlite3_step(nst);
                    sqlite3_finalize(nst);
                  }
                  notify_user(ticket_owner_id, "ticket_closed", std::to_string(ticket_id));
                  simulate_email("User#" + std::to_string(ticket_owner_id), "Talep Kapatıldı", "Talebiniz kapatılmıştır.");
                }
                
                sqlite3_stmt *hst = nullptr;
                const char *hsql = "INSERT INTO ticket_history (ticket_id, user_id, action, created_at) VALUES (?, ?, ?, ?)";
                if (sqlite3_prepare_v2(g_db, hsql, -1, &hst, nullptr) == SQLITE_OK) {
                  std::string action = "Durum Güncellendi: " + stv;
                  sqlite3_bind_int64(hst, 1, ticket_id);
                  sqlite3_bind_int64(hst, 2, me->id);
                  sqlite3_bind_text(hst, 3, action.c_str(), -1, SQLITE_TRANSIENT);
                  sqlite3_bind_text(hst, 4, ts.c_str(), -1, SQLITE_TRANSIENT);
                  sqlite3_step(hst);
                  sqlite3_finalize(hst);
                }
              }

              if (body.contains("assignees")) {
                if (me->role == "support") {
                  res.status = 403;
                  res.set_content(json{{"error", "forbidden_assignment"}}.dump(), "application/json");
                  return;
                }
                
                std::vector<int64_t> new_assignees;
                for (auto& a : body["assignees"]) {
                    if (a.is_number()) {
                      new_assignees.push_back(a.get<int64_t>());
                    } else if (a.is_string()) {
                      new_assignees.push_back(std::stoll(a.get<std::string>()));
                    }
                }

                // Delete old assignees
                sqlite3_stmt *dst = nullptr;
                if (sqlite3_prepare_v2(g_db, "DELETE FROM ticket_assignees WHERE ticket_id = ?", -1, &dst, nullptr) == SQLITE_OK) {
                    sqlite3_bind_int64(dst, 1, ticket_id);
                    if (sqlite3_step(dst) != SQLITE_DONE) {
                      sqlite3_finalize(dst);
                      res.status = 500;
                      res.set_content(json{{"error", "assignees_delete_failed"}}.dump(), "application/json");
                      return;
                    }
                    sqlite3_finalize(dst);
                }
                
                if (!new_assignees.empty()) {
                    // Update status to assigned if open
                    sqlite3_stmt *st = nullptr;
                    const char *sql = "UPDATE tickets SET status = CASE WHEN status = 'open' THEN 'assigned' ELSE status END, updated_at = ? WHERE id = ?";
                    if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) == SQLITE_OK) {
                        sqlite3_bind_text(st, 1, ts.c_str(), -1, SQLITE_TRANSIENT);
                        sqlite3_bind_int64(st, 2, ticket_id);
                        sqlite3_step(st);
                        sqlite3_finalize(st);
                    }
                    
                    for (int64_t aid : new_assignees) {
                        sqlite3_stmt *ist = nullptr;
                        if (sqlite3_prepare_v2(g_db, "INSERT INTO ticket_assignees (ticket_id, user_id) VALUES (?, ?)", -1, &ist, nullptr) == SQLITE_OK) {
                            sqlite3_bind_int64(ist, 1, ticket_id);
                            sqlite3_bind_int64(ist, 2, aid);
                            if (sqlite3_step(ist) != SQLITE_DONE) {
                              sqlite3_finalize(ist);
                              res.status = 500;
                              res.set_content(json{{"error", "assignees_insert_failed"}}.dump(), "application/json");
                              return;
                            }
                            sqlite3_finalize(ist);
                        }
                        
                        // Notify assignee
                        sqlite3_stmt *nst = nullptr;
                        const char *nsql = "INSERT INTO notifications (user_id, message, created_at, link) VALUES (?, ?, ?, ?)";
                        if (sqlite3_prepare_v2(g_db, nsql, -1, &nst, nullptr) == SQLITE_OK) {
                          std::string msg = "Üzerinize #" + std::to_string(ticket_id) + " numaralı talep atandı.";
                          std::string link = "/app/tickets/" + std::to_string(ticket_id);
                          sqlite3_bind_int64(nst, 1, aid);
                          sqlite3_bind_text(nst, 2, msg.c_str(), -1, SQLITE_TRANSIENT);
                          sqlite3_bind_text(nst, 3, ts.c_str(), -1, SQLITE_TRANSIENT);
                          sqlite3_bind_text(nst, 4, link.c_str(), -1, SQLITE_TRANSIENT);
                          sqlite3_step(nst);
                          sqlite3_finalize(nst);
                        }
                    }
                } else {
                    // If empty assignees, maybe unset assigned status? We'll leave it or set to open.
                    sqlite3_stmt *st = nullptr;
                    const char *sql = "UPDATE tickets SET updated_at = ? WHERE id = ?";
                    if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) == SQLITE_OK) {
                        sqlite3_bind_text(st, 1, ts.c_str(), -1, SQLITE_TRANSIENT);
                        sqlite3_bind_int64(st, 2, ticket_id);
                        sqlite3_step(st);
                        sqlite3_finalize(st);
                    }
                }

                sqlite3_stmt *hst = nullptr;
                const char *hsql = "INSERT INTO ticket_history (ticket_id, user_id, action, created_at) VALUES (?, ?, ?, ?)";
                if (sqlite3_prepare_v2(g_db, hsql, -1, &hst, nullptr) == SQLITE_OK) {
                  std::string action = new_assignees.empty() ? "Tüm Atamalar Kaldırıldı" : "Personel Atamaları Güncellendi";
                  sqlite3_bind_int64(hst, 1, ticket_id);
                  sqlite3_bind_int64(hst, 2, me->id);
                  sqlite3_bind_text(hst, 3, action.c_str(), -1, SQLITE_TRANSIENT);
                  sqlite3_bind_text(hst, 4, ts.c_str(), -1, SQLITE_TRANSIENT);
                  sqlite3_step(hst);
                  sqlite3_finalize(hst);
                }
              }
              
              if (body.contains("rating")) {
                int rating = body["rating"].get<int>();
                if (rating >= 1 && rating <= 5) {
                    sqlite3_stmt *st = nullptr;
                    const char *sql = "UPDATE tickets SET rating = ?, updated_at = ? WHERE id = ?";
                    if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) == SQLITE_OK) {
                      sqlite3_bind_int(st, 1, rating);
                      sqlite3_bind_text(st, 2, ts.c_str(), -1, SQLITE_TRANSIENT);
                      sqlite3_bind_int64(st, 3, ticket_id);
                      sqlite3_step(st);
                      sqlite3_finalize(st);
                    }
                }
              }

              res.set_content(json{{"ok", true}}.dump(), "application/json");
            });

  svr.Get("/api/support-staff", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }
    auto me = user_from_token(*tok);
    if (!me || (me->role != "superuser" && me->role != "manager")) {
      res.status = 403;
      res.set_content(json{{"error", "forbidden"}}.dump(), "application/json");
      return;
    }

    std::lock_guard<std::mutex> dblock(g_db_mutex);
    sqlite3_stmt *st = nullptr;
    const char *sql = "SELECT id, display_name FROM users WHERE role IN ('superuser', 'manager', 'support')";
    if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) != SQLITE_OK) {
      res.status = 500;
      return;
    }
    json arr = json::array();
    while (sqlite3_step(st) == SQLITE_ROW) {
      arr.push_back(json{{"id", sqlite3_column_int64(st, 0)},
                         {"display_name",
                          reinterpret_cast<const char *>(sqlite3_column_text(st, 1))}});
    }
    sqlite3_finalize(st);
    res.set_content(json{{"staff", arr}}.dump(), "application/json");
  });

  svr.Get(R"(/api/tickets/(\d+))", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }
    auto me = user_from_token(*tok);
    if (!me) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }

    int64_t ticket_id = std::stoll(req.matches[1]);
    std::lock_guard<std::mutex> dblock(g_db_mutex);

    std::string sql =
        "SELECT t.id, t.user_id, t.title, t.description, t.category, t.status, t.priority, "
        "t.photo_path, t.created_at, t.updated_at, "
        "u.display_name AS owner_name, "
        "t.rating, t.resolved_at "
        "FROM tickets t JOIN users u ON u.id = t.user_id "
        "WHERE t.id = ?";
    if (me->role != "superuser" && me->role != "manager") {
      if (me->role == "support") {
        sql += " AND t.id IN (SELECT ticket_id FROM ticket_assignees WHERE user_id = ?)";
      } else {
        sql += " AND t.user_id = ?";
      }
    }

    sqlite3_stmt *st = nullptr;
    if (sqlite3_prepare_v2(g_db, sql.c_str(), -1, &st, nullptr) != SQLITE_OK) {
      res.status = 500;
      return;
    }
    sqlite3_bind_int64(st, 1, ticket_id);
    if (me->role != "superuser" && me->role != "manager") {
      sqlite3_bind_int64(st, 2, me->id);
    }

    if (sqlite3_step(st) == SQLITE_ROW) {
      json item;
      item["id"] = sqlite3_column_int64(st, 0);
      item["user_id"] = sqlite3_column_int64(st, 1);
      item["title"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 2));
      item["description"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 3));
      if (sqlite3_column_type(st, 4) != SQLITE_NULL)
        item["category"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 4));
      else
        item["category"] = "";
      item["status"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 5));
      item["priority"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 6));
      if (sqlite3_column_type(st, 7) == SQLITE_NULL)
        item["photo_path"] = nullptr;
      else
        item["photo_path"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 7));
      item["created_at"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 8));
      item["updated_at"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 9));
      item["owner_name"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 10));
        
      if (sqlite3_column_type(st, 10) == SQLITE_NULL)
        item["rating"] = nullptr;
      else
        item["rating"] = sqlite3_column_int(st, 10);
        
      if (sqlite3_column_type(st, 11) == SQLITE_NULL)
        item["resolved_at"] = nullptr;
      else
        item["resolved_at"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 11));

      // Fetch assignees
      sqlite3_stmt *ast = nullptr;
      std::string asql = "SELECT a.user_id, u.display_name, a.is_completed FROM ticket_assignees a JOIN users u ON u.id = a.user_id WHERE a.ticket_id = ?";
      json assignees = json::array();
      if (sqlite3_prepare_v2(g_db, asql.c_str(), -1, &ast, nullptr) == SQLITE_OK) {
        sqlite3_bind_int64(ast, 1, item["id"].get<int64_t>());
        while (sqlite3_step(ast) == SQLITE_ROW) {
            assignees.push_back({
                {"id", sqlite3_column_int64(ast, 0)},
                {"name", reinterpret_cast<const char *>(sqlite3_column_text(ast, 1))}, // Fix column reading index here as well
                {"is_completed", sqlite3_column_int(ast, 2) == 1}
            });
        }
        sqlite3_finalize(ast);
      }
      item["assignees"] = assignees;

      sqlite3_finalize(st);
      res.set_content(item.dump(), "application/json");
    } else {
      sqlite3_finalize(st);
      res.status = 404;
      res.set_content(json{{"error", "not_found"}}.dump(), "application/json");
    }
  });

  svr.Post("/api/users", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }
    auto me = user_from_token(*tok);
    if (!me || (me->role != "superuser" && me->role != "manager")) {
      res.status = 403;
      res.set_content(json{{"error", "forbidden"}}.dump(), "application/json");
      return;
    }

    json body;
    try {
      body = json::parse(req.body);
    } catch (...) {
      res.status = 400;
      res.set_content(json{{"error", "invalid_json"}}.dump(), "application/json");
      return;
    }
    std::string email = body.value("email", "");
    std::string password = body.value("password", "");
    std::string display_name = body.value("display_name", "");
    std::string role = body.value("role", "user");
    std::string user_type = body.value("user_type", "");

    if (email.empty() || password.empty() || display_name.empty()) {
      res.status = 400;
      res.set_content(json{{"error", "all_fields_required"}}.dump(), "application/json");
      return;
    }
    if (role != "user" && role != "superuser" && role != "support" && role != "manager") role = "user";
    
    std::string hashed_pw = crypto::hash_password(password);

    std::lock_guard<std::mutex> dblock(g_db_mutex);
    sqlite3_stmt *st = nullptr;
    const char *sql =
        "INSERT INTO users (email, password, display_name, role, user_type) VALUES (?, ?, ?, ?, ?)";
    if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) != SQLITE_OK) {
      res.status = 500;
      return;
    }
    sqlite3_bind_text(st, 1, email.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(st, 2, hashed_pw.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(st, 3, display_name.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(st, 4, role.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(st, 5, user_type.c_str(), -1, SQLITE_TRANSIENT);

    if (sqlite3_step(st) != SQLITE_DONE) {
      sqlite3_finalize(st);
      res.status = 400;
      res.set_content(json{{"error", "email_exists_or_db_error"}}.dump(), "application/json");
      return;
    }
    sqlite3_finalize(st);
    int64_t new_id = sqlite3_last_insert_rowid(g_db);
    res.status = 201;
    res.set_content(json{{"id", new_id}, {"success", true}}.dump(), "application/json");
  });

  svr.Get(R"(/api/tickets/(\d+)/history)", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }
    auto me = user_from_token(*tok);
    if (!me) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }

    int64_t ticket_id = std::stoll(req.matches[1]);
    std::lock_guard<std::mutex> dblock(g_db_mutex);

    std::string sql = "SELECT h.id, h.action, h.created_at, u.display_name FROM ticket_history h JOIN users u ON u.id = h.user_id WHERE h.ticket_id = ? ORDER BY datetime(h.created_at) ASC";
    sqlite3_stmt *st = nullptr;
    if (sqlite3_prepare_v2(g_db, sql.c_str(), -1, &st, nullptr) != SQLITE_OK) {
      res.status = 500;
      return;
    }
    sqlite3_bind_int64(st, 1, ticket_id);

    json arr = json::array();
    while (sqlite3_step(st) == SQLITE_ROW) {
      json item;
      item["id"] = sqlite3_column_int64(st, 0);
      item["action"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 1));
      item["created_at"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 2));
      item["user_name"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 3));
      arr.push_back(item);
    }
    sqlite3_finalize(st);
    res.set_content(arr.dump(), "application/json");
  });

  svr.Post(R"(/api/tickets/(\d+)/history)", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }
    auto me = user_from_token(*tok);
    if (!me || (me->role != "superuser" && me->role != "manager" && me->role != "support")) {
      res.status = 403;
      res.set_content(json{{"error", "forbidden"}}.dump(), "application/json");
      return;
    }

    int64_t ticket_id = std::stoll(req.matches[1]);
    
    json body;
    try {
      body = json::parse(req.body);
    } catch (...) {
      res.status = 400;
      res.set_content(json{{"error", "invalid_json"}}.dump(), "application/json");
      return;
    }

    std::string action = body.value("action", "");
    if (action.empty()) {
      res.status = 400;
      res.set_content(json{{"error", "action_required"}}.dump(), "application/json");
      return;
    }

    std::string ts = now_iso();
    std::lock_guard<std::mutex> dblock(g_db_mutex);

    sqlite3_stmt *hst = nullptr;
    const char *hsql = "INSERT INTO ticket_history (ticket_id, user_id, action, created_at) VALUES (?, ?, ?, ?)";
    if (sqlite3_prepare_v2(g_db, hsql, -1, &hst, nullptr) == SQLITE_OK) {
      sqlite3_bind_int64(hst, 1, ticket_id);
      sqlite3_bind_int64(hst, 2, me->id);
      sqlite3_bind_text(hst, 3, action.c_str(), -1, SQLITE_TRANSIENT);
      sqlite3_bind_text(hst, 4, ts.c_str(), -1, SQLITE_TRANSIENT);
      sqlite3_step(hst);
      sqlite3_finalize(hst);
      
      int64_t new_id = sqlite3_last_insert_rowid(g_db);
      res.status = 201;
      res.set_content(json{{"id", new_id}, {"success", true}}.dump(), "application/json");
    } else {
      res.status = 500;
      res.set_content(json{{"error", "db_error"}}.dump(), "application/json");
    }
  });

  svr.Post(R"(/api/tickets/(\d+)/request_close)", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }
    auto me = user_from_token(*tok);
    if (!me) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }

    int64_t ticket_id = std::stoll(req.matches[1]);
    std::string ts = now_iso();
    std::lock_guard<std::mutex> dblock(g_db_mutex);

    AssigneeProgress ap = get_assignee_progress(ticket_id);
    if (ap.total > 0 && ap.completed < ap.total) {
      res.status = 400;
      res.set_content(json{{"error", "assignees_incomplete"},
                          {"completed", ap.completed},
                          {"total", ap.total}}
                         .dump(),
                      "application/json");
      return;
    }

    set_ticket_pending_close(ticket_id, me->id, ts,
                             "Çözüm sağlandı, yönetici onayı bekleniyor");

    res.status = 200;
    res.set_content(json{{"success", true}}.dump(), "application/json");
  });

  svr.Post(R"(/api/tickets/(\d+)/complete_part)", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }
    auto me = user_from_token(*tok);
    if (!me || (me->role != "support" && me->role != "manager")) {
      res.status = 403;
      res.set_content(json{{"error", "forbidden"}}.dump(), "application/json");
      return;
    }

    int64_t ticket_id = std::stoll(req.matches[1]);
    std::string ts = now_iso();
    std::lock_guard<std::mutex> dblock(g_db_mutex);

    // Verify user is assigned
    sqlite3_stmt *chk = nullptr;
    if (sqlite3_prepare_v2(g_db, "SELECT is_completed FROM ticket_assignees WHERE ticket_id = ? AND user_id = ?", -1, &chk, nullptr) == SQLITE_OK) {
        sqlite3_bind_int64(chk, 1, ticket_id);
        sqlite3_bind_int64(chk, 2, me->id);
        if (sqlite3_step(chk) != SQLITE_ROW) {
            sqlite3_finalize(chk);
            res.status = 403;
            res.set_content(json{{"error", "not_assigned"}}.dump(), "application/json");
            return;
        }
        sqlite3_finalize(chk);
    }

    sqlite3_stmt *st = nullptr;
    if (sqlite3_prepare_v2(g_db, "UPDATE ticket_assignees SET is_completed = 1 WHERE ticket_id = ? AND user_id = ?", -1, &st, nullptr) == SQLITE_OK) {
        sqlite3_bind_int64(st, 1, ticket_id);
        sqlite3_bind_int64(st, 2, me->id);
        sqlite3_step(st);
        sqlite3_finalize(st);
    }

    // Add to history
    sqlite3_stmt *hst = nullptr;
    const char *hsql = "INSERT INTO ticket_history (ticket_id, user_id, action, created_at) VALUES (?, ?, ?, ?)";
    if (sqlite3_prepare_v2(g_db, hsql, -1, &hst, nullptr) == SQLITE_OK) {
      std::string action = "Kendi görev bölümünü tamamladı";
      sqlite3_bind_int64(hst, 1, ticket_id);
      sqlite3_bind_int64(hst, 2, me->id);
      sqlite3_bind_text(hst, 3, action.c_str(), -1, SQLITE_TRANSIENT);
      sqlite3_bind_text(hst, 4, ts.c_str(), -1, SQLITE_TRANSIENT);
      sqlite3_step(hst);
      sqlite3_finalize(hst);
    }

    maybe_auto_pending_close(ticket_id, me->id, ts);

    res.status = 200;
    res.set_content(json{{"success", true}}.dump(), "application/json");
  });

  svr.Post(R"(/api/tickets/(\d+)/ping_view)", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) return;
    auto me = user_from_token(*tok);
    if (!me) return;

    int64_t ticket_id = std::stoll(req.matches[1]);
    
    std::lock_guard<std::mutex> lock(g_viewers_mutex);
    g_ticket_viewers[ticket_id][me->id] = { me->display_name, std::chrono::steady_clock::now() };
    
    res.status = 200;
  });

  svr.Get(R"(/api/tickets/(\d+)/viewers)", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) return;
    auto me = user_from_token(*tok);
    if (!me) return;

    int64_t ticket_id = std::stoll(req.matches[1]);
    auto now = std::chrono::steady_clock::now();
    
    json arr = json::array();
    std::lock_guard<std::mutex> lock(g_viewers_mutex);
    auto &viewers = g_ticket_viewers[ticket_id];
    for (auto it = viewers.begin(); it != viewers.end(); ) {
      if (std::chrono::duration_cast<std::chrono::seconds>(now - it->second.last_seen).count() > 15) {
        it = viewers.erase(it);
      } else {
        if (it->first != me->id) { // Don't return self
          arr.push_back(it->second.display_name);
        }
        ++it;
      }
    }
    
    res.set_content(arr.dump(), "application/json");
  });

  svr.Post(R"(/api/tickets/(\d+)/backup)", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) return;
    auto me = user_from_token(*tok);
    if (!me || (me->role != "support" && me->role != "manager" && me->role != "superuser")) return;

    int64_t ticket_id = std::stoll(req.matches[1]);
    std::string ts = now_iso();
    std::lock_guard<std::mutex> dblock(g_db_mutex);

    sqlite3_stmt *mst = nullptr;
    const char *msql = "SELECT user_id FROM ticket_history WHERE ticket_id = ? AND action = 'Yeni Personel Atandı' ORDER BY id DESC LIMIT 1";
    if (sqlite3_prepare_v2(g_db, msql, -1, &mst, nullptr) == SQLITE_OK) {
      sqlite3_bind_int64(mst, 1, ticket_id);
      std::vector<int64_t> user_ids;
      if (sqlite3_step(mst) == SQLITE_ROW) {
        int64_t assigner_id = sqlite3_column_int64(mst, 0);
        if (assigner_id != me->id) {
          user_ids.push_back(assigner_id);
        }
      } 
      
      if (user_ids.empty()) {
        // Fallback: Notify all managers if we can't find who assigned it, or if they assigned it to themselves
        sqlite3_stmt *fmst = nullptr;
        const char *fmsql = "SELECT id FROM users WHERE role IN ('manager', 'superuser') AND id != ?";
        if (sqlite3_prepare_v2(g_db, fmsql, -1, &fmst, nullptr) == SQLITE_OK) {
            sqlite3_bind_int64(fmst, 1, me->id);
            while (sqlite3_step(fmst) == SQLITE_ROW) {
                user_ids.push_back(sqlite3_column_int64(fmst, 0));
            }
            sqlite3_finalize(fmst);
        }
      }
      sqlite3_finalize(mst);

      for (int64_t uid : user_ids) {
        sqlite3_stmt *nst = nullptr;
        const char *nsql = "INSERT INTO notifications (user_id, message, created_at, link) VALUES (?, ?, ?, ?)";
        if (sqlite3_prepare_v2(g_db, nsql, -1, &nst, nullptr) == SQLITE_OK) {
          std::string msg = "YARDIM ÇAĞRISI: " + me->display_name + " #" + std::to_string(ticket_id) + " numaralı bilette desteğinizi istiyor.";
          std::string link = "/app/tickets/" + std::to_string(ticket_id);
          sqlite3_bind_int64(nst, 1, uid);
          sqlite3_bind_text(nst, 2, msg.c_str(), -1, SQLITE_TRANSIENT);
          sqlite3_bind_text(nst, 3, ts.c_str(), -1, SQLITE_TRANSIENT);
          sqlite3_bind_text(nst, 4, link.c_str(), -1, SQLITE_TRANSIENT);
          sqlite3_step(nst);
          sqlite3_finalize(nst);
        }
      }
    }

    res.status = 200;
    res.set_content(json{{"success", true}}.dump(), "application/json");
  });

  svr.Get("/api/notifications", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }
    auto me = user_from_token(*tok);
    if (!me) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }

    std::lock_guard<std::mutex> dblock(g_db_mutex);
    std::string sql = "SELECT id, message, is_read, created_at, link FROM notifications WHERE user_id = ? ORDER BY datetime(created_at) DESC";
    sqlite3_stmt *st = nullptr;
    if (sqlite3_prepare_v2(g_db, sql.c_str(), -1, &st, nullptr) != SQLITE_OK) {
      res.status = 500;
      return;
    }
    sqlite3_bind_int64(st, 1, me->id);

    json arr = json::array();
    while (sqlite3_step(st) == SQLITE_ROW) {
      json item;
      item["id"] = sqlite3_column_int64(st, 0);
      item["message"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 1));
      item["is_read"] = sqlite3_column_int(st, 2) == 1;
      item["created_at"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 3));
      if (sqlite3_column_type(st, 4) != SQLITE_NULL) {
        item["link"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 4));
      } else {
        item["link"] = nullptr;
      }
      arr.push_back(item);
    }
    sqlite3_finalize(st);
    res.set_content(arr.dump(), "application/json");
  });

  svr.Patch(R"(/api/notifications/(\d+)/read)", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }
    auto me = user_from_token(*tok);
    if (!me) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }

    int64_t n_id = std::stoll(req.matches[1]);
    std::lock_guard<std::mutex> dblock(g_db_mutex);
    std::string sql = "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?";
    sqlite3_stmt *st = nullptr;
    if (sqlite3_prepare_v2(g_db, sql.c_str(), -1, &st, nullptr) != SQLITE_OK) {
      res.status = 500;
      return;
    }
    sqlite3_bind_int64(st, 1, n_id);
    sqlite3_bind_int64(st, 2, me->id);
    sqlite3_step(st);
    sqlite3_finalize(st);
    res.set_content(json{{"ok", true}}.dump(), "application/json");
  });
  
  svr.Post("/api/upload", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }
    auto me = user_from_token(*tok);
    if (!me) {
      res.status = 401;
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }

    if (!req.has_file("file")) {
        res.status = 400;
        res.set_content(json{{"error", "no_file"}}.dump(), "application/json");
        return;
    }

    const auto &file = req.get_file_value("file");
    
    // Generate simple UUID
    std::string rand_str = random_token().substr(0, 16);
    std::string ext = "";
    if (file.filename.find('.') != std::string::npos) {
        ext = file.filename.substr(file.filename.find_last_of('.'));
    }
    std::string out_name = rand_str + ext;
    std::string out_path = "./uploads/" + out_name;
    
    fs::create_directories("./uploads");
    
    std::ofstream ofs(out_path, std::ios::binary);
    ofs << file.content;
    ofs.close();
    
    res.set_content(json{{"url", "/uploads/" + out_name}}.dump(), "application/json");
  });

  svr.set_mount_point("/uploads", "./uploads");

  // ── Yorum Sistemi ──────────────────────────────────────────────────────────

  // GET /api/tickets/:id/comments  — Yorumları listele
  svr.Get(R"(/api/tickets/(\d+)/comments)", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) { res.status = 401; res.set_content(json{{"error","unauthorized"}}.dump(),"application/json"); return; }
    auto me = user_from_token(*tok);
    if (!me)  { res.status = 401; res.set_content(json{{"error","unauthorized"}}.dump(),"application/json"); return; }

    int64_t ticket_id = 0;
    try { ticket_id = std::stoll(req.matches[1]); } catch(...) { res.status = 400; return; }

    std::lock_guard<std::mutex> dblock(g_db_mutex);
    sqlite3_stmt *st = nullptr;
    const char *sql =
      "SELECT c.id, c.user_id, u.display_name, c.body, c.created_at "
      "FROM ticket_comments c JOIN users u ON u.id = c.user_id "
      "WHERE c.ticket_id = ? ORDER BY c.created_at ASC";
    if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) != SQLITE_OK) {
      res.status = 500; return;
    }
    sqlite3_bind_int64(st, 1, ticket_id);
    json arr = json::array();
    while (sqlite3_step(st) == SQLITE_ROW) {
      json c;
      c["id"]           = sqlite3_column_int64(st, 0);
      c["user_id"]      = sqlite3_column_int64(st, 1);
      c["display_name"] = reinterpret_cast<const char*>(sqlite3_column_text(st, 2));
      c["body"]         = reinterpret_cast<const char*>(sqlite3_column_text(st, 3));
      c["created_at"]   = reinterpret_cast<const char*>(sqlite3_column_text(st, 4));
      arr.push_back(c);
    }
    sqlite3_finalize(st);
    res.set_content(arr.dump(), "application/json");
  });

  // POST /api/tickets/:id/comments  — Yorum ekle
  svr.Post(R"(/api/tickets/(\d+)/comments)", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) { res.status = 401; res.set_content(json{{"error","unauthorized"}}.dump(),"application/json"); return; }
    auto me = user_from_token(*tok);
    if (!me)  { res.status = 401; res.set_content(json{{"error","unauthorized"}}.dump(),"application/json"); return; }

    int64_t ticket_id = 0;
    try { ticket_id = std::stoll(req.matches[1]); } catch(...) { res.status = 400; return; }

    json body;
    try { body = json::parse(req.body); } catch(...) { res.status = 400; return; }
    std::string comment_body = body.value("body", "");
    if (comment_body.empty()) {
      res.status = 400;
      res.set_content(json{{"error","body_required"}}.dump(), "application/json");
      return;
    }
    bool is_internal = body.value("is_internal", false);
    // Only support/manager can post internal notes
    if (is_internal && me->role != "support" && me->role != "manager" && me->role != "superuser") {
      is_internal = false;
    }

    std::string ts = now_iso();
    std::lock_guard<std::mutex> dblock(g_db_mutex);
    sqlite3_stmt *st = nullptr;
    const char *sql =
      "INSERT INTO ticket_comments (ticket_id, user_id, body, is_internal, created_at) VALUES (?, ?, ?, ?, ?)";
    if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) != SQLITE_OK) {
      res.status = 500; return;
    }
    sqlite3_bind_int64(st, 1, ticket_id);
    sqlite3_bind_int64(st, 2, me->id);
    sqlite3_bind_text(st, 3, comment_body.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_int(st, 4, is_internal ? 1 : 0);
    sqlite3_bind_text(st, 5, ts.c_str(), -1, SQLITE_TRANSIENT);
    int rc = sqlite3_step(st);
    sqlite3_finalize(st);
    if (rc != SQLITE_DONE) { res.status = 500; return; }

    // SSE bildirimi — yöneticilere ve destek personeline
    sqlite3_stmt *nst = nullptr;
    const char *nsql = "SELECT id FROM users WHERE role IN ('manager','superuser','support')";
    if (sqlite3_prepare_v2(g_db, nsql, -1, &nst, nullptr) == SQLITE_OK) {
      std::vector<int64_t> staff_ids;
      while (sqlite3_step(nst) == SQLITE_ROW) staff_ids.push_back(sqlite3_column_int64(nst, 0));
      sqlite3_finalize(nst);
      std::string evt_data = std::to_string(ticket_id);
      for (int64_t sid : staff_ids) {
        if (sid != me->id) notify_user(sid, "ticket_comment", evt_data);
      }
    }

    json out{{"ok", true}, {"created_at", ts}};
    res.status = 201;
    res.set_content(out.dump(), "application/json");
  });

  // ── Duyuru Sistemi ──
  svr.Get("/api/announcements", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) { res.status = 401; return; }
    auto me = user_from_token(*tok);
    if (!me) { res.status = 401; return; }

    std::lock_guard<std::mutex> dblock(g_db_mutex);
    sqlite3_stmt *st = nullptr;
    const char *sql = "SELECT a.id, a.title, a.body, a.is_active, a.created_at, u.display_name "
                      "FROM announcements a JOIN users u ON u.id = a.user_id "
                      "ORDER BY a.id DESC LIMIT 20";
    if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) != SQLITE_OK) { res.status = 500; return; }
    json arr = json::array();
    while (sqlite3_step(st) == SQLITE_ROW) {
      arr.push_back({
        {"id", sqlite3_column_int64(st, 0)},
        {"title", reinterpret_cast<const char*>(sqlite3_column_text(st, 1))},
        {"body", reinterpret_cast<const char*>(sqlite3_column_text(st, 2))},
        {"is_active", sqlite3_column_int(st, 3) == 1},
        {"created_at", reinterpret_cast<const char*>(sqlite3_column_text(st, 4))},
        {"author", reinterpret_cast<const char*>(sqlite3_column_text(st, 5))}
      });
    }
    sqlite3_finalize(st);
    res.set_content(arr.dump(), "application/json");
  });

  svr.Post("/api/announcements", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) { res.status = 401; return; }
    auto me = user_from_token(*tok);
    if (!me || (me->role != "manager" && me->role != "superuser")) { res.status = 403; return; }

    auto body = json::parse(req.body, nullptr, false);
    if (body.is_discarded()) { res.status = 400; return; }
    std::string title = body.value("title", "");
    std::string bdy = body.value("body", "");
    if (title.empty() || bdy.empty()) { res.status = 400; return; }

    std::string ts = now_iso();
    std::lock_guard<std::mutex> dblock(g_db_mutex);
    sqlite3_stmt *st = nullptr;
    const char *sql = "INSERT INTO announcements (user_id, title, body, created_at) VALUES (?, ?, ?, ?)";
    if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) == SQLITE_OK) {
      sqlite3_bind_int64(st, 1, me->id);
      sqlite3_bind_text(st, 2, title.c_str(), -1, SQLITE_TRANSIENT);
      sqlite3_bind_text(st, 3, bdy.c_str(), -1, SQLITE_TRANSIENT);
      sqlite3_bind_text(st, 4, ts.c_str(), -1, SQLITE_TRANSIENT);
      sqlite3_step(st);
      sqlite3_finalize(st);
    }
    res.status = 201;
    res.set_content(json{{"ok", true}}.dump(), "application/json");
  });

  svr.Patch(R"(/api/announcements/(\d+))", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) { res.status = 401; return; }
    auto me = user_from_token(*tok);
    if (!me || (me->role != "manager" && me->role != "superuser")) { res.status = 403; return; }

    int64_t ann_id = std::stoll(req.matches[1]);
    auto body = json::parse(req.body, nullptr, false);
    if (body.is_discarded()) { res.status = 400; return; }

    std::lock_guard<std::mutex> dblock(g_db_mutex);
    if (body.contains("is_active")) {
      sqlite3_stmt *st = nullptr;
      if (sqlite3_prepare_v2(g_db, "UPDATE announcements SET is_active = ? WHERE id = ?", -1, &st, nullptr) == SQLITE_OK) {
        sqlite3_bind_int(st, 1, body["is_active"].get<bool>() ? 1 : 0);
        sqlite3_bind_int64(st, 2, ann_id);
        sqlite3_step(st);
        sqlite3_finalize(st);
      }
    }
    res.status = 200;
    res.set_content(json{{"ok", true}}.dump(), "application/json");
  });

  // ── Audit Log ──
  svr.Get("/api/audit-log", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) { res.status = 401; return; }
    auto me = user_from_token(*tok);
    if (!me || (me->role != "manager" && me->role != "superuser")) { res.status = 403; return; }

    std::lock_guard<std::mutex> dblock(g_db_mutex);
    sqlite3_stmt *st = nullptr;
    const char *sql = "SELECT a.id, a.user_id, u.display_name, a.action, a.detail, a.ip_address, a.created_at "
                      "FROM audit_log a LEFT JOIN users u ON u.id = a.user_id "
                      "ORDER BY a.id DESC LIMIT 100";
    if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) != SQLITE_OK) { res.status = 500; return; }
    json arr = json::array();
    while (sqlite3_step(st) == SQLITE_ROW) {
      json entry;
      entry["id"] = sqlite3_column_int64(st, 0);
      entry["user_id"] = sqlite3_column_int64(st, 1);
      entry["user_name"] = sqlite3_column_type(st, 2) != SQLITE_NULL ? reinterpret_cast<const char*>(sqlite3_column_text(st, 2)) : "—";
      entry["action"] = reinterpret_cast<const char*>(sqlite3_column_text(st, 3));
      entry["detail"] = sqlite3_column_type(st, 4) != SQLITE_NULL ? reinterpret_cast<const char*>(sqlite3_column_text(st, 4)) : "";
      entry["ip_address"] = sqlite3_column_type(st, 5) != SQLITE_NULL ? reinterpret_cast<const char*>(sqlite3_column_text(st, 5)) : "";
      entry["created_at"] = reinterpret_cast<const char*>(sqlite3_column_text(st, 6));
      arr.push_back(entry);
    }
    sqlite3_finalize(st);
    res.set_content(arr.dump(), "application/json");
  });

  // ── Zaman Bazlı Trend (analytics/trend) ──
  svr.Get("/api/analytics/trend", [](const httplib::Request &req, httplib::Response &res) {
    set_cors(res);
    auto tok = bearer_token(req);
    if (!tok) { res.status = 401; return; }
    auto me = user_from_token(*tok);
    if (!me || (me->role != "manager" && me->role != "superuser")) { res.status = 403; return; }

    std::lock_guard<std::mutex> dblock(g_db_mutex);
    json arr = json::array();
    sqlite3_stmt *st = nullptr;
    const char *sql = R"(
      SELECT date(created_at) as day,
             SUM(CASE WHEN status != 'closed' THEN 1 ELSE 0 END) as opened,
             SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed
      FROM tickets
      WHERE created_at >= date('now', '-30 days')
      GROUP BY date(created_at)
      ORDER BY day
    )";
    if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) == SQLITE_OK) {
      while (sqlite3_step(st) == SQLITE_ROW) {
        arr.push_back({
          {"date", reinterpret_cast<const char*>(sqlite3_column_text(st, 0))},
          {"opened", sqlite3_column_int(st, 1)},
          {"closed", sqlite3_column_int(st, 2)}
        });
      }
      sqlite3_finalize(st);
    }
    res.set_content(arr.dump(), "application/json");
  });

  int port = 8080;
  if (const char* env_p = std::getenv("PORT")) {
    if (int p = std::atoi(env_p)) {
      port = p;
    }
  }
  std::cout << "Destek MAU API listening on 0.0.0.0:" << port << "\n";
  auto ret = svr.listen("0.0.0.0", port);
  db_close();
  return ret ? 0 : 1;
}
