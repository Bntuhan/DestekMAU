#pragma once
#include <libpq-fe.h>
#include <string>
#include <vector>
#include <iostream>
#include <cstring>
#include <stdexcept>
#include <unordered_map>

typedef PGconn* sqlite3;

#define SQLITE_OK 0
#define SQLITE_ROW 100
#define SQLITE_DONE 101
#define SQLITE_NULL 5
#define SQLITE_TRANSIENT nullptr

extern std::unordered_map<sqlite3, int64_t> g_last_insert_rowid;

struct sqlite3_stmt {
    PGconn *conn = nullptr;
    std::string original_sql;
    std::string pg_sql;
    std::vector<std::string> params;
    std::vector<bool> is_null;
    PGresult *res = nullptr;
    int current_row = -1;
    int num_rows = 0;
};

inline std::unordered_map<sqlite3, int64_t> g_last_insert_rowid;

inline int sqlite3_open(const char *conninfo, sqlite3 **ppDb) {
    *ppDb = PQconnectdb(conninfo);
    if (PQstatus(*ppDb) != CONNECTION_OK) {
        std::cerr << "Connection to database failed: " << PQerrorMessage(*ppDb) << std::endl;
        PQfinish(*ppDb);
        *ppDb = nullptr;
        return 1;
    }
    return SQLITE_OK;
}

inline int sqlite3_close(sqlite3 *db) {
    if (db) PQfinish(db);
    return SQLITE_OK;
}

inline int sqlite3_exec(sqlite3 *db, const char *sql, int (*callback)(void*,int,char**,char**), void *arg, char **errmsg) {
    std::string s(sql);
    size_t pos = 0;
    while ((pos = s.find("INTEGER PRIMARY KEY AUTOINCREMENT")) != std::string::npos) {
        s.replace(pos, 33, "SERIAL PRIMARY KEY");
    }
    
    PGresult *res = PQexec(db, s.c_str());
    if (PQresultStatus(res) != PGRES_COMMAND_OK && PQresultStatus(res) != PGRES_TUPLES_OK) {
        if (errmsg) {
            std::string err = PQerrorMessage(db);
            *errmsg = strdup(err.c_str());
        }
        PQclear(res);
        return 1;
    }
    PQclear(res);
    return SQLITE_OK;
}

inline int sqlite3_prepare_v2(sqlite3 *db, const char *zSql, int nByte, sqlite3_stmt **ppStmt, const char **pzTail) {
    *ppStmt = new sqlite3_stmt;
    (*ppStmt)->conn = db;
    (*ppStmt)->original_sql = zSql;
    
    std::string pg_sql;
    int param_idx = 1;
    for (size_t i = 0; i < (*ppStmt)->original_sql.length(); ++i) {
        if ((*ppStmt)->original_sql[i] == '?') {
            pg_sql += "$" + std::to_string(param_idx++);
        } else {
            pg_sql += (*ppStmt)->original_sql[i];
        }
    }
    (*ppStmt)->pg_sql = pg_sql;
    int num_params = param_idx - 1;
    (*ppStmt)->params.resize(num_params);
    (*ppStmt)->is_null.resize(num_params, true);
    
    return SQLITE_OK;
}

inline int sqlite3_bind_int(sqlite3_stmt *pStmt, int i, int v) {
    if (i < 1 || i > (int)pStmt->params.size()) return 1;
    pStmt->params[i-1] = std::to_string(v);
    pStmt->is_null[i-1] = false;
    return SQLITE_OK;
}

inline int sqlite3_bind_int64(sqlite3_stmt *pStmt, int i, int64_t v) {
    if (i < 1 || i > (int)pStmt->params.size()) return 1;
    pStmt->params[i-1] = std::to_string(v);
    pStmt->is_null[i-1] = false;
    return SQLITE_OK;
}

inline int sqlite3_bind_text(sqlite3_stmt *pStmt, int i, const char *zData, int n, void (*xDel)(void*)) {
    if (i < 1 || i > (int)pStmt->params.size()) return 1;
    if (zData == nullptr) {
        pStmt->is_null[i-1] = true;
    } else {
        pStmt->params[i-1] = zData;
        pStmt->is_null[i-1] = false;
    }
    return SQLITE_OK;
}

inline int sqlite3_bind_null(sqlite3_stmt *pStmt, int i) {
    if (i < 1 || i > (int)pStmt->params.size()) return 1;
    pStmt->is_null[i-1] = true;
    return SQLITE_OK;
}

inline void sqlite3_free(void *p) {
    if (p) free(p);
}

inline int sqlite3_step(sqlite3_stmt *pStmt) {
    if (pStmt->current_row == -1) {
        int nParams = pStmt->params.size();
        std::vector<const char*> paramValues(nParams);
        for (int i = 0; i < nParams; ++i) {
            if (pStmt->is_null[i]) {
                paramValues[i] = nullptr;
            } else {
                paramValues[i] = pStmt->params[i].c_str();
            }
        }
        
        std::string sql = pStmt->pg_sql;
        if (sql.find("INSERT INTO") != std::string::npos && sql.find("RETURNING id") == std::string::npos) {
            sql += " RETURNING id";
        }
        
        size_t pos = 0;
        while ((pos = sql.find("datetime(")) != std::string::npos) {
            size_t end = sql.find(")", pos);
            if (end != std::string::npos) {
                std::string arg = sql.substr(pos + 9, end - pos - 9);
                sql.replace(pos, end - pos + 1, arg + "::timestamp");
            }
        }

        pos = 0;
        while ((pos = sql.find("(julianday(resolved_at) - julianday(created_at)) * 24")) != std::string::npos) {
            sql.replace(pos, 53, "EXTRACT(EPOCH FROM (resolved_at::timestamp - created_at::timestamp)) / 3600");
        }
        
        pStmt->res = PQexecParams(pStmt->conn, sql.c_str(), nParams, nullptr, paramValues.data(), nullptr, nullptr, 0);
        ExecStatusType status = PQresultStatus(pStmt->res);
        if (status != PGRES_COMMAND_OK && status != PGRES_TUPLES_OK) {
            std::cerr << "PQexecParams failed: " << PQerrorMessage(pStmt->conn) << "\nQuery: " << sql << std::endl;
            return 1;
        }
        
        pStmt->num_rows = PQntuples(pStmt->res);
        pStmt->current_row = 0;
        
        if (pStmt->num_rows > 0 && sql.find("RETURNING id") != std::string::npos) {
            g_last_insert_rowid[pStmt->conn] = std::stoll(PQgetvalue(pStmt->res, 0, 0));
        }
    } else {
        pStmt->current_row++;
    }
    
    if (pStmt->current_row < pStmt->num_rows) {
        return SQLITE_ROW;
    }
    return SQLITE_DONE;
}

inline int sqlite3_finalize(sqlite3_stmt *pStmt) {
    if (pStmt) {
        if (pStmt->res) {
            PQclear(pStmt->res);
        }
        delete pStmt;
    }
    return SQLITE_OK;
}

inline int64_t sqlite3_column_int64(sqlite3_stmt *pStmt, int iCol) {
    if (!pStmt->res || pStmt->current_row >= pStmt->num_rows) return 0;
    if (PQgetisnull(pStmt->res, pStmt->current_row, iCol)) return 0;
    return std::stoll(PQgetvalue(pStmt->res, pStmt->current_row, iCol));
}

inline int sqlite3_column_int(sqlite3_stmt *pStmt, int iCol) {
    return (int)sqlite3_column_int64(pStmt, iCol);
}

inline double sqlite3_column_double(sqlite3_stmt *pStmt, int iCol) {
    if (!pStmt->res || pStmt->current_row >= pStmt->num_rows) return 0.0;
    if (PQgetisnull(pStmt->res, pStmt->current_row, iCol)) return 0.0;
    return std::stod(PQgetvalue(pStmt->res, pStmt->current_row, iCol));
}

inline const unsigned char* sqlite3_column_text(sqlite3_stmt *pStmt, int iCol) {
    if (!pStmt->res || pStmt->current_row >= pStmt->num_rows) return nullptr;
    if (PQgetisnull(pStmt->res, pStmt->current_row, iCol)) return nullptr;
    return reinterpret_cast<const unsigned char*>(PQgetvalue(pStmt->res, pStmt->current_row, iCol));
}

inline int sqlite3_column_type(sqlite3_stmt *pStmt, int iCol) {
    if (!pStmt->res || pStmt->current_row >= pStmt->num_rows) return SQLITE_NULL;
    if (PQgetisnull(pStmt->res, pStmt->current_row, iCol)) return SQLITE_NULL;
    return 1;
}

inline int64_t sqlite3_last_insert_rowid(sqlite3 *db) {
    return g_last_insert_rowid[db];
}
