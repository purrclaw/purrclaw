const express = require("express");
const cors = require("cors");
const path = require("node:path");
const {
  setSetting,
  deleteSetting,
  getDb,
} = require("../../db/database");

const RESERVED_QUERY_KEYS = new Set(["_start", "_end", "_sort", "_order"]);

function toNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function buildSortClause(req, allowedColumns, fallbackSort) {
  const sortRaw = typeof req.query._sort === "string" ? req.query._sort : "";
  const orderRaw = typeof req.query._order === "string" ? req.query._order : "";

  const sortColumns = sortRaw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => allowedColumns.has(v));

  if (sortColumns.length === 0) {
    return `ORDER BY ${fallbackSort}`;
  }

  const orderValues = orderRaw
    .split(",")
    .map((v) => (v.trim().toUpperCase() === "DESC" ? "DESC" : "ASC"));

  const sortSql = sortColumns
    .map((column, index) => `${column} ${orderValues[index] || orderValues[0] || "ASC"}`)
    .join(", ");

  return `ORDER BY ${sortSql}`;
}

function buildWhereClause(req, allowedColumns, searchColumns = []) {
  const clauses = [];
  const params = [];

  for (const [rawKey, rawValue] of Object.entries(req.query)) {
    if (RESERVED_QUERY_KEYS.has(rawKey) || rawValue === undefined || rawValue === null) {
      continue;
    }

    if (rawKey === "q") {
      const value = String(rawValue).trim();
      if (!value || searchColumns.length === 0) {
        continue;
      }
      const searchClause = searchColumns.map((column) => `LOWER(${column}) LIKE LOWER(?)`).join(" OR ");
      clauses.push(`(${searchClause})`);
      for (let i = 0; i < searchColumns.length; i += 1) {
        params.push(`%${value}%`);
      }
      continue;
    }

    let operator = "eq";
    let column = rawKey;

    if (rawKey.endsWith("_like")) {
      operator = "like";
      column = rawKey.slice(0, -5);
    } else if (rawKey.endsWith("_ne")) {
      operator = "ne";
      column = rawKey.slice(0, -3);
    } else if (rawKey.endsWith("_gte")) {
      operator = "gte";
      column = rawKey.slice(0, -4);
    } else if (rawKey.endsWith("_lte")) {
      operator = "lte";
      column = rawKey.slice(0, -4);
    }

    if (!allowedColumns.has(column)) {
      continue;
    }

    const value = String(rawValue);
    if (operator === "like") {
      clauses.push(`LOWER(${column}) LIKE LOWER(?)`);
      params.push(`%${value}%`);
    } else if (operator === "ne") {
      clauses.push(`${column} != ?`);
      params.push(value);
    } else if (operator === "gte") {
      clauses.push(`${column} >= ?`);
      params.push(value);
    } else if (operator === "lte") {
      clauses.push(`${column} <= ?`);
      params.push(value);
    } else {
      clauses.push(`${column} = ?`);
      params.push(value);
    }
  }

  if (clauses.length === 0) {
    return { whereSql: "", params: [] };
  }

  return {
    whereSql: `WHERE ${clauses.join(" AND ")}`,
    params,
  };
}

async function runListQuery(db, req, config) {
  const {
    selectSql,
    countSql,
    allowedColumns,
    searchColumns,
    fallbackSort,
  } = config;

  const start = Math.max(0, toNumber(req.query._start, 0));
  const endRaw = toNumber(req.query._end, start + 10);
  const limit = Math.max(1, endRaw - start);

  const { whereSql, params } = buildWhereClause(req, allowedColumns, searchColumns);
  const sortSql = buildSortClause(req, allowedColumns, fallbackSort);

  const dataSql = `${selectSql} ${whereSql} ${sortSql} LIMIT ? OFFSET ?`;
  const rows = await db.all(dataSql, ...params, limit, start);

  const totalRow = await db.get(`${countSql} ${whereSql}`, ...params);
  const total = totalRow?.total ?? 0;

  return { rows, total };
}

function sendList(res, rows, total) {
  res.set("x-total-count", String(total)).json(rows);
}

// ─── Router factory ───────────────────────────────────────────────────────────

function startAdminServer(port = 3000) {
  const app = express();
  app.use(
    cors({
      exposedHeaders: ["x-total-count"],
    }),
  );
  app.use(express.json({ limit: "2mb" }));

  // ── Settings ──────────────────────────────────────────────────────────────

  app.get("/api/settings", async (req, res) => {
    try {
      const db = getDb();
      const { rows, total } = await runListQuery(db, req, {
        selectSql: "SELECT key, value, description, updated_at, key AS id FROM settings",
        countSql: "SELECT COUNT(*) AS total FROM settings",
        allowedColumns: new Set(["key", "value", "description", "updated_at"]),
        searchColumns: ["key", "value", "description"],
        fallbackSort: "updated_at DESC",
      });
      sendList(res, rows, total);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/settings/:id", async (req, res) => {
    try {
      const db = getDb();
      const row = await db.get(
        "SELECT key, value, description, updated_at, key AS id FROM settings WHERE key = ?",
        req.params.id,
      );
      row ? res.json(row) : res.status(404).json({ error: "Not found" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const key = String(req.body.id || req.body.key || "").trim();
      if (!key) {
        return res.status(400).json({ error: "key is required" });
      }
      await setSetting(key, req.body.value || "", req.body.description || "");
      const db = getDb();
      const row = await db.get(
        "SELECT key, value, description, updated_at, key AS id FROM settings WHERE key = ?",
        key,
      );
      return res.status(201).json(row);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/settings/:id", async (req, res) => {
    try {
      const db = getDb();
      const existing = await db.get("SELECT key, value, description FROM settings WHERE key = ?", req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Not found" });
      }

      await setSetting(
        req.params.id,
        req.body.value ?? existing.value ?? "",
        req.body.description ?? existing.description ?? "",
      );

      const updated = await db.get(
        "SELECT key, value, description, updated_at, key AS id FROM settings WHERE key = ?",
        req.params.id,
      );
      return res.json(updated);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/settings/:id", async (req, res) => {
    try {
      await deleteSetting(req.params.id);
      res.json({ id: req.params.id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Memory ────────────────────────────────────────────────────────────────

  app.get("/api/memory", async (req, res) => {
    try {
      const db = getDb();
      const { rows, total } = await runListQuery(db, req, {
        selectSql: "SELECT key, value, updated_at, key AS id FROM memory",
        countSql: "SELECT COUNT(*) AS total FROM memory",
        allowedColumns: new Set(["key", "value", "updated_at"]),
        searchColumns: ["key", "value"],
        fallbackSort: "updated_at DESC",
      });
      sendList(res, rows, total);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/memory/:id", async (req, res) => {
    try {
      const db = getDb();
      const row = await db.get("SELECT key, value, updated_at, key AS id FROM memory WHERE key = ?", req.params.id);
      row ? res.json(row) : res.status(404).json({ error: "Not found" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/memory", async (req, res) => {
    try {
      const db = getDb();
      const key = String(req.body.id || req.body.key || "").trim();
      if (!key) {
        return res.status(400).json({ error: "key is required" });
      }
      const now = Date.now();
      await db.run(
        "INSERT INTO memory (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        key,
        req.body.value || "",
        now,
      );
      const row = await db.get("SELECT key, value, updated_at, key AS id FROM memory WHERE key = ?", key);
      return res.status(201).json(row);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/memory/:id", async (req, res) => {
    try {
      const db = getDb();
      const now = Date.now();
      await db.run(
        "INSERT INTO memory (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        req.params.id,
        req.body.value || "",
        now,
      );
      const row = await db.get("SELECT key, value, updated_at, key AS id FROM memory WHERE key = ?", req.params.id);
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/memory/:id", async (req, res) => {
    try {
      const db = getDb();
      await db.run("DELETE FROM memory WHERE key = ?", req.params.id);
      res.json({ id: req.params.id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── State ─────────────────────────────────────────────────────────────────

  app.get("/api/state", async (req, res) => {
    try {
      const db = getDb();
      const { rows, total } = await runListQuery(db, req, {
        selectSql: "SELECT key, value, updated_at, key AS id FROM state",
        countSql: "SELECT COUNT(*) AS total FROM state",
        allowedColumns: new Set(["key", "value", "updated_at"]),
        searchColumns: ["key", "value"],
        fallbackSort: "key ASC",
      });
      sendList(res, rows, total);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/state/:id", async (req, res) => {
    try {
      const db = getDb();
      const row = await db.get("SELECT key, value, updated_at, key AS id FROM state WHERE key = ?", req.params.id);
      row ? res.json(row) : res.status(404).json({ error: "Not found" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/state", async (req, res) => {
    try {
      const db = getDb();
      const key = String(req.body.id || req.body.key || "").trim();
      if (!key) {
        return res.status(400).json({ error: "key is required" });
      }
      await db.run(
        "INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        key,
        req.body.value || "",
        Date.now(),
      );
      const row = await db.get("SELECT key, value, updated_at, key AS id FROM state WHERE key = ?", key);
      return res.status(201).json(row);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/state/:id", async (req, res) => {
    try {
      const db = getDb();
      await db.run(
        "INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        req.params.id,
        req.body.value || "",
        Date.now(),
      );
      const row = await db.get("SELECT key, value, updated_at, key AS id FROM state WHERE key = ?", req.params.id);
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/state/:id", async (req, res) => {
    try {
      const db = getDb();
      await db.run("DELETE FROM state WHERE key = ?", req.params.id);
      res.json({ id: req.params.id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Sessions ──────────────────────────────────────────────────────────────

  app.get("/api/sessions", async (req, res) => {
    try {
      const db = getDb();
      const { rows, total } = await runListQuery(db, req, {
        selectSql: `
          SELECT
            s.session_key,
            s.summary,
            s.created_at,
            s.updated_at,
            s.session_key AS id,
            (SELECT COUNT(*) FROM messages m WHERE m.session_key = s.session_key) AS message_count,
            (SELECT MAX(m.created_at) FROM messages m WHERE m.session_key = s.session_key) AS last_message_at
          FROM sessions s
        `,
        countSql: "SELECT COUNT(*) AS total FROM sessions s",
        allowedColumns: new Set(["session_key", "summary", "created_at", "updated_at"]),
        searchColumns: ["session_key", "summary"],
        fallbackSort: "updated_at DESC",
      });
      sendList(res, rows, total);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const db = getDb();
      const row = await db.get(
        `
          SELECT
            s.session_key,
            s.summary,
            s.created_at,
            s.updated_at,
            s.session_key AS id,
            (SELECT COUNT(*) FROM messages m WHERE m.session_key = s.session_key) AS message_count,
            (SELECT MAX(m.created_at) FROM messages m WHERE m.session_key = s.session_key) AS last_message_at
          FROM sessions s
          WHERE s.session_key = ?
        `,
        req.params.id,
      );
      row ? res.json(row) : res.status(404).json({ error: "Not found" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/sessions", async (req, res) => {
    try {
      const db = getDb();
      const sessionKey = String(req.body.id || req.body.session_key || "").trim();
      if (!sessionKey) {
        return res.status(400).json({ error: "session_key is required" });
      }
      const now = Date.now();
      await db.run(
        "INSERT OR IGNORE INTO sessions (session_key, summary, created_at, updated_at) VALUES (?, ?, ?, ?)",
        sessionKey,
        req.body.summary || "",
        now,
        now,
      );
      if (req.body.summary !== undefined) {
        await db.run("UPDATE sessions SET summary = ?, updated_at = ? WHERE session_key = ?", req.body.summary || "", now, sessionKey);
      }
      const row = await db.get(
        "SELECT session_key, summary, created_at, updated_at, session_key AS id FROM sessions WHERE session_key = ?",
        sessionKey,
      );
      return res.status(201).json(row);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/sessions/:id", async (req, res) => {
    try {
      const db = getDb();
      const existing = await db.get("SELECT session_key, summary FROM sessions WHERE session_key = ?", req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Not found" });
      }
      await db.run(
        "UPDATE sessions SET summary = ?, updated_at = ? WHERE session_key = ?",
        req.body.summary ?? existing.summary ?? "",
        Date.now(),
        req.params.id,
      );
      const updated = await db.get(
        "SELECT session_key, summary, created_at, updated_at, session_key AS id FROM sessions WHERE session_key = ?",
        req.params.id,
      );
      return res.json(updated);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/sessions/:id", async (req, res) => {
    try {
      const db = getDb();
      await db.run("DELETE FROM sessions WHERE session_key = ?", req.params.id);
      res.json({ id: req.params.id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Messages ──────────────────────────────────────────────────────────────

  app.get("/api/messages", async (req, res) => {
    try {
      const db = getDb();
      const { rows, total } = await runListQuery(db, req, {
        selectSql: "SELECT id, session_key, role, content, tool_calls, tool_call_id, created_at FROM messages",
        countSql: "SELECT COUNT(*) AS total FROM messages",
        allowedColumns: new Set(["id", "session_key", "role", "content", "tool_call_id", "created_at"]),
        searchColumns: ["session_key", "role", "content", "tool_call_id"],
        fallbackSort: "id DESC",
      });
      sendList(res, rows, total);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/messages/:id", async (req, res) => {
    try {
      const db = getDb();
      const row = await db.get(
        "SELECT id, session_key, role, content, tool_calls, tool_call_id, created_at FROM messages WHERE id = ?",
        req.params.id,
      );
      row ? res.json(row) : res.status(404).json({ error: "Not found" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const db = getDb();
      const sessionKey = String(req.body.session_key || "").trim();
      const role = String(req.body.role || "").trim();
      if (!sessionKey || !role) {
        return res.status(400).json({ error: "session_key and role are required" });
      }

      const session = await db.get("SELECT session_key FROM sessions WHERE session_key = ?", sessionKey);
      if (!session) {
        return res.status(400).json({ error: `Unknown session_key: ${sessionKey}` });
      }

      const createdAt = toNumber(req.body.created_at, Date.now());
      await db.run(
        "INSERT INTO messages (session_key, role, content, tool_calls, tool_call_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        sessionKey,
        role,
        req.body.content || "",
        req.body.tool_calls ?? null,
        req.body.tool_call_id ?? null,
        createdAt,
      );
      const inserted = await db.get("SELECT last_insert_rowid() AS id");
      await db.run("UPDATE sessions SET updated_at = ? WHERE session_key = ?", Date.now(), sessionKey);
      const row = await db.get(
        "SELECT id, session_key, role, content, tool_calls, tool_call_id, created_at FROM messages WHERE id = ?",
        inserted.id,
      );
      return res.status(201).json(row);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/messages/:id", async (req, res) => {
    try {
      const db = getDb();
      const existing = await db.get(
        "SELECT id, session_key, role, content, tool_calls, tool_call_id, created_at FROM messages WHERE id = ?",
        req.params.id,
      );
      if (!existing) {
        return res.status(404).json({ error: "Not found" });
      }

      const nextSessionKey = req.body.session_key ?? existing.session_key;
      if (nextSessionKey !== existing.session_key) {
        const session = await db.get("SELECT session_key FROM sessions WHERE session_key = ?", nextSessionKey);
        if (!session) {
          return res.status(400).json({ error: `Unknown session_key: ${nextSessionKey}` });
        }
      }

      await db.run(
        `
          UPDATE messages
          SET session_key = ?, role = ?, content = ?, tool_calls = ?, tool_call_id = ?, created_at = ?
          WHERE id = ?
        `,
        nextSessionKey,
        req.body.role ?? existing.role,
        req.body.content ?? existing.content,
        req.body.tool_calls ?? existing.tool_calls,
        req.body.tool_call_id ?? existing.tool_call_id,
        req.body.created_at ?? existing.created_at,
        req.params.id,
      );

      await db.run("UPDATE sessions SET updated_at = ? WHERE session_key IN (?, ?)", Date.now(), existing.session_key, nextSessionKey);

      const updated = await db.get(
        "SELECT id, session_key, role, content, tool_calls, tool_call_id, created_at FROM messages WHERE id = ?",
        req.params.id,
      );
      return res.json(updated);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/messages/:id", async (req, res) => {
    try {
      const db = getDb();
      await db.run("DELETE FROM messages WHERE id = ?", req.params.id);
      res.json({ id: Number(req.params.id) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Static frontend ───────────────────────────────────────────────────────

  const frontendDistPath = path.resolve(__dirname, "../../../admin/frontend/dist");
  app.use(express.static(frontendDistPath));
  app.get("/{*path}", (req, res) => {
    res.sendFile(path.resolve(frontendDistPath, "index.html"));
  });

  const server = app.listen(port, () => {
    console.log(`✅ Admin panel → http://localhost:${port}`);
    console.log(`✅ Admin API   → http://localhost:${port}/api`);
  });

  server.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      console.error(`❌ Admin port ${port} is already in use. Set ADMIN_PORT to a free port.`);
      process.exit(1);
    }
    console.error("❌ Admin server error:", err);
    process.exit(1);
  });

  return server;
}

module.exports = { startAdminServer };
