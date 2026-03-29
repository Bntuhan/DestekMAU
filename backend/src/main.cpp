#include <httplib.h>
#include <nlohmann/json.hpp>

#include <sqlite3.h>

#include <ctime>

#include <cstdlib>
#include <cstring>
#include <filesystem>
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

std::mutex g_db_mutex;
sqlite3 *g_db = nullptr;

std::mutex g_sessions_mutex;
std::unordered_map<std::string, int64_t> g_token_to_user;

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

void init_db(const std::string &path) {
  if (sqlite3_open(path.c_str(), &g_db) != SQLITE_OK) {
    throw std::runtime_error("sqlite3_open failed");
  }
  db_exec(R"SQL(
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','superuser'))
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','assigned','closed')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')),
      assignee_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(assignee_id) REFERENCES users(id)
    );
  )SQL");

  sqlite3_stmt *st = nullptr;
  const char *count_sql = "SELECT COUNT(*) FROM users";
  if (sqlite3_prepare_v2(g_db, count_sql, -1, &st, nullptr) != SQLITE_OK)
    throw std::runtime_error("prepare failed");
  int n = 0;
  if (sqlite3_step(st) == SQLITE_ROW) n = sqlite3_column_int(st, 0);
  sqlite3_finalize(st);

  if (n == 0) {
    db_exec(
        "INSERT INTO users (email, password, display_name, role) VALUES "
        "('ogrenci@artuklu.edu.tr', 'artuklu2026', 'Demo Öğrenci', 'user'),"
        "('destek@artuklu.edu.tr', 'super2026', 'Demo Destek', 'superuser');");
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
};

std::optional<UserRow> user_from_token(const std::string &token) {
  int64_t uid = 0;
  {
    std::lock_guard<std::mutex> lock(g_sessions_mutex);
    auto it = g_token_to_user.find(token);
    if (it == g_token_to_user.end()) return std::nullopt;
    uid = it->second;
  }
  std::lock_guard<std::mutex> dblock(g_db_mutex);
  sqlite3_stmt *st = nullptr;
  const char *sql = "SELECT id, email, display_name, role FROM users WHERE id = ?";
  if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) != SQLITE_OK) return std::nullopt;
  sqlite3_bind_int64(st, 1, uid);
  std::optional<UserRow> out;
  if (sqlite3_step(st) == SQLITE_ROW) {
    UserRow u;
    u.id = sqlite3_column_int64(st, 0);
    u.email = reinterpret_cast<const char *>(sqlite3_column_text(st, 1));
    u.display_name = reinterpret_cast<const char *>(sqlite3_column_text(st, 2));
    u.role = reinterpret_cast<const char *>(sqlite3_column_text(st, 3));
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
              {"role", u.role}};
}

std::string now_iso() {
  std::time_t t = std::time(nullptr);
  char buf[32];
  std::strftime(buf, sizeof buf, "%Y-%m-%dT%H:%M:%SZ", std::gmtime(&t));
  return buf;
}

} // namespace

int main(int argc, char **argv) {
  std::string db_path = "destek_mau.db";
  if (argc > 1) db_path = argv[1];

  try {
    fs::path dir = fs::path(db_path).parent_path();
    if (!dir.empty() && !fs::exists(dir)) fs::create_directories(dir);
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

    std::lock_guard<std::mutex> dblock(g_db_mutex);
    sqlite3_stmt *st = nullptr;
    const char *sql =
        "SELECT id, email, display_name, role FROM users WHERE email = ? AND "
        "password = ?";
    if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) != SQLITE_OK) {
      res.status = 500;
      return;
    }
    sqlite3_bind_text(st, 1, email.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(st, 2, password.c_str(), -1, SQLITE_TRANSIENT);

    std::optional<UserRow> u;
    if (sqlite3_step(st) == SQLITE_ROW) {
      UserRow row;
      row.id = sqlite3_column_int64(st, 0);
      row.email = reinterpret_cast<const char *>(sqlite3_column_text(st, 1));
      row.display_name = reinterpret_cast<const char *>(sqlite3_column_text(st, 2));
      row.role = reinterpret_cast<const char *>(sqlite3_column_text(st, 3));
      u = row;
    }
    sqlite3_finalize(st);

    if (!u) {
      res.status = 401;
      res.set_content(json{{"error", "invalid_credentials"}}.dump(), "application/json");
      return;
    }

    std::string token = random_token();
    {
      std::lock_guard<std::mutex> lock(g_sessions_mutex);
      g_token_to_user[token] = u->id;
    }

    json out{{"token", token}, {"user", user_json(*u)}};
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
      res.set_content(json{{"error", "unauthorized"}}.dump(), "application/json");
      return;
    }
    res.set_content(user_json(*u).dump(), "application/json");
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
        "SELECT t.id, t.user_id, t.title, t.description, t.status, t.priority, "
        "t.assignee_id, t.created_at, t.updated_at, "
        "u.display_name AS owner_name, a.display_name AS assignee_name "
        "FROM tickets t JOIN users u ON u.id = t.user_id "
        "LEFT JOIN users a ON a.id = t.assignee_id WHERE 1=1 ";
    if (me->role != "superuser") {
      sql += "AND t.user_id = ? ";
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
    if (me->role != "superuser") sqlite3_bind_int64(st, bind++, me->id);
    if (!status_filter.empty() && status_filter != "all")
      sqlite3_bind_text(st, bind++, status_filter.c_str(), -1, SQLITE_TRANSIENT);

    json arr = json::array();
    while (sqlite3_step(st) == SQLITE_ROW) {
      json item;
      item["id"] = sqlite3_column_int64(st, 0);
      item["user_id"] = sqlite3_column_int64(st, 1);
      item["title"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 2));
      item["description"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 3));
      item["status"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 4));
      item["priority"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 5));
      if (sqlite3_column_type(st, 6) == SQLITE_NULL)
        item["assignee_id"] = nullptr;
      else
        item["assignee_id"] = sqlite3_column_int64(st, 6);
      item["created_at"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 7));
      item["updated_at"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 8));
      item["owner_name"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 9));
      if (sqlite3_column_type(st, 10) == SQLITE_NULL)
        item["assignee_name"] = nullptr;
      else
        item["assignee_name"] =
            reinterpret_cast<const char *>(sqlite3_column_text(st, 10));
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
    std::string priority = body.value("priority", "normal");
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
        "INSERT INTO tickets (user_id, title, description, status, priority, "
        "assignee_id, created_at, updated_at) VALUES (?, ?, ?, 'open', ?, NULL, ?, ?)";
    if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) != SQLITE_OK) {
      res.status = 500;
      return;
    }
    sqlite3_bind_int64(st, 1, me->id);
    sqlite3_bind_text(st, 2, title.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(st, 3, description.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(st, 4, priority.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(st, 5, ts.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(st, 6, ts.c_str(), -1, SQLITE_TRANSIENT);
    if (sqlite3_step(st) != SQLITE_DONE) {
      sqlite3_finalize(st);
      res.status = 500;
      return;
    }
    sqlite3_finalize(st);
    int64_t new_id = sqlite3_last_insert_rowid(g_db);
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
              if (!me || me->role != "superuser") {
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
              if (sqlite3_prepare_v2(g_db, "SELECT id FROM tickets WHERE id = ?", -1,
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
              sqlite3_finalize(chk);

              std::string ts = now_iso();

              if (body.contains("status")) {
                std::string stv = body["status"].get<std::string>();
                if (stv != "open" && stv != "assigned" && stv != "closed") {
                  res.status = 400;
                  res.set_content(json{{"error", "bad_status"}}.dump(), "application/json");
                  return;
                }
                sqlite3_stmt *st = nullptr;
                const char *sql =
                    "UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?";
                if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) != SQLITE_OK) {
                  res.status = 500;
                  return;
                }
                sqlite3_bind_text(st, 1, stv.c_str(), -1, SQLITE_TRANSIENT);
                sqlite3_bind_text(st, 2, ts.c_str(), -1, SQLITE_TRANSIENT);
                sqlite3_bind_int64(st, 3, ticket_id);
                sqlite3_step(st);
                sqlite3_finalize(st);
              }

              if (body.contains("assignee_id")) {
                if (body["assignee_id"].is_null()) {
                  sqlite3_stmt *st = nullptr;
                  const char *sql =
                      "UPDATE tickets SET assignee_id = NULL, updated_at = ? WHERE id = ?";
                  if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) != SQLITE_OK) {
                    res.status = 500;
                    return;
                  }
                  sqlite3_bind_text(st, 1, ts.c_str(), -1, SQLITE_TRANSIENT);
                  sqlite3_bind_int64(st, 2, ticket_id);
                  sqlite3_step(st);
                  sqlite3_finalize(st);
                } else {
                  int64_t aid = body["assignee_id"].get<int64_t>();
                  sqlite3_stmt *st = nullptr;
                  const char *sql =
                      "UPDATE tickets SET assignee_id = ?, status = CASE WHEN status = "
                      "'open' THEN 'assigned' ELSE status END, updated_at = ? WHERE id = ?";
                  if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) != SQLITE_OK) {
                    res.status = 500;
                    return;
                  }
                  sqlite3_bind_int64(st, 1, aid);
                  sqlite3_bind_text(st, 2, ts.c_str(), -1, SQLITE_TRANSIENT);
                  sqlite3_bind_int64(st, 3, ticket_id);
                  sqlite3_step(st);
                  sqlite3_finalize(st);
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
    if (!me || me->role != "superuser") {
      res.status = 403;
      res.set_content(json{{"error", "forbidden"}}.dump(), "application/json");
      return;
    }

    std::lock_guard<std::mutex> dblock(g_db_mutex);
    sqlite3_stmt *st = nullptr;
    const char *sql = "SELECT id, display_name FROM users WHERE role = 'superuser'";
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
        "SELECT t.id, t.user_id, t.title, t.description, t.status, t.priority, "
        "t.assignee_id, t.created_at, t.updated_at, "
        "u.display_name AS owner_name, a.display_name AS assignee_name "
        "FROM tickets t JOIN users u ON u.id = t.user_id "
        "LEFT JOIN users a ON a.id = t.assignee_id WHERE t.id = ?";
    if (me->role != "superuser") {
      sql += " AND t.user_id = ?";
    }

    sqlite3_stmt *st = nullptr;
    if (sqlite3_prepare_v2(g_db, sql.c_str(), -1, &st, nullptr) != SQLITE_OK) {
      res.status = 500;
      return;
    }
    sqlite3_bind_int64(st, 1, ticket_id);
    if (me->role != "superuser") {
      sqlite3_bind_int64(st, 2, me->id);
    }

    if (sqlite3_step(st) == SQLITE_ROW) {
      json item;
      item["id"] = sqlite3_column_int64(st, 0);
      item["user_id"] = sqlite3_column_int64(st, 1);
      item["title"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 2));
      item["description"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 3));
      item["status"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 4));
      item["priority"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 5));
      if (sqlite3_column_type(st, 6) == SQLITE_NULL)
        item["assignee_id"] = nullptr;
      else
        item["assignee_id"] = sqlite3_column_int64(st, 6);
      item["created_at"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 7));
      item["updated_at"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 8));
      item["owner_name"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 9));
      if (sqlite3_column_type(st, 10) == SQLITE_NULL)
        item["assignee_name"] = nullptr;
      else
        item["assignee_name"] = reinterpret_cast<const char *>(sqlite3_column_text(st, 10));

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
    if (!me || me->role != "superuser") {
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

    if (email.empty() || password.empty() || display_name.empty()) {
      res.status = 400;
      res.set_content(json{{"error", "all_fields_required"}}.dump(), "application/json");
      return;
    }
    if (role != "user" && role != "superuser") role = "user";

    std::lock_guard<std::mutex> dblock(g_db_mutex);
    sqlite3_stmt *st = nullptr;
    const char *sql = "INSERT INTO users (email, password, display_name, role) VALUES (?, ?, ?, ?)";
    if (sqlite3_prepare_v2(g_db, sql, -1, &st, nullptr) != SQLITE_OK) {
      res.status = 500;
      return;
    }
    sqlite3_bind_text(st, 1, email.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(st, 2, password.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(st, 3, display_name.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(st, 4, role.c_str(), -1, SQLITE_TRANSIENT);

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

  std::cout << "Destek MAU API http://127.0.0.1:8080\n";
  auto ret = svr.listen("127.0.0.1", 8080);
  db_close();
  return ret ? 0 : 1;
}
