const express = require("express");
const cors = require("cors");
const path = require("node:path");
const fs = require("node:fs/promises");
const {
  setSetting,
  deleteSetting,
  getDb,
} = require("../../db/database");
const { runListQuery, toNumber } = require("./queryBuilder");

const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || "./workspace");
const PROFILES_DIR = path.join(WORKSPACE_DIR, "profiles");
const ADMIN_READ_ONLY = String(process.env.ADMIN_READ_ONLY || "false").toLowerCase() === "true";

function ensureWritable(req, res, next) {
  if (!ADMIN_READ_ONLY) {
    return next();
  }
  return res.status(403).json({ error: "Admin is in read-only mode (ADMIN_READ_ONLY=true)" });
}

function sendList(res, rows, total) {
  res.set("x-total-count", String(total)).json(rows);
}

async function listProfileMarkdownFiles(rootDir) {
  const results = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        results.push(absPath);
      }
    }
  }

  try {
    await walk(rootDir);
  } catch {
    return [];
  }

  return results;
}

async function syncProfilesFromFilesystem(db) {
  const files = await listProfileMarkdownFiles(PROFILES_DIR);
  const now = Date.now();
  let synced = 0;

  for (const filePath of files) {
    const relPath = path.relative(PROFILES_DIR, filePath);
    const normalizedRelPath = relPath.split(path.sep).join("/");
    const profile = normalizedRelPath.includes("/")
      ? normalizedRelPath.slice(0, normalizedRelPath.indexOf("/"))
      : "default";
    const fileName = path.basename(filePath);

    const stat = await fs.stat(filePath);
    const mtimeMs = Math.floor(stat.mtimeMs);
    const row = await db.get(
      "SELECT id, source_mtime FROM profiles_docs WHERE source_path = ?",
      normalizedRelPath,
    );

    if (row && Number(row.source_mtime) === mtimeMs) {
      continue;
    }

    const content = await fs.readFile(filePath, "utf8");

    await db.run(
      `
      INSERT INTO profiles_docs (profile, file_name, source_path, content, source_mtime, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_path)
      DO UPDATE SET
        profile = excluded.profile,
        file_name = excluded.file_name,
        content = excluded.content,
        source_mtime = excluded.source_mtime,
        updated_at = excluded.updated_at
      `,
      profile,
      fileName,
      normalizedRelPath,
      content,
      mtimeMs,
      now,
    );

    synced += 1;
  }

  return { scanned: files.length, synced };
}

function startAdminServer(port = 3000) {
  const app = express();
  app.use(cors({ exposedHeaders: ["x-total-count"] }));
  app.use(express.json({ limit: "5mb" }));

  app.get("/api/admin/meta", async (_req, res) => {
    res.json({ readOnly: ADMIN_READ_ONLY, profilesDir: PROFILES_DIR });
  });

  // settings
  app.get("/api/settings", async (req, res) => {
    try {
      const db = getDb();
      const { rows, total } = await runListQuery(db, req.query, {
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
      const row = await db.get("SELECT key, value, description, updated_at, key AS id FROM settings WHERE key = ?", req.params.id);
      row ? res.json(row) : res.status(404).json({ error: "Not found" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/settings", ensureWritable, async (req, res) => {
    try {
      const key = String(req.body.id || req.body.key || "").trim();
      if (!key) return res.status(400).json({ error: "key is required" });
      await setSetting(key, req.body.value || "", req.body.description || "");
      const db = getDb();
      const row = await db.get("SELECT key, value, description, updated_at, key AS id FROM settings WHERE key = ?", key);
      return res.status(201).json(row);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/settings/:id", ensureWritable, async (req, res) => {
    try {
      const db = getDb();
      const existing = await db.get("SELECT key, value, description FROM settings WHERE key = ?", req.params.id);
      if (!existing) return res.status(404).json({ error: "Not found" });
      await setSetting(req.params.id, req.body.value ?? existing.value ?? "", req.body.description ?? existing.description ?? "");
      const updated = await db.get("SELECT key, value, description, updated_at, key AS id FROM settings WHERE key = ?", req.params.id);
      return res.json(updated);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/settings/:id", ensureWritable, async (req, res) => {
    try {
      await deleteSetting(req.params.id);
      res.json({ id: req.params.id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // memory
  app.get("/api/memory", async (req, res) => {
    try {
      const db = getDb();
      const { rows, total } = await runListQuery(db, req.query, {
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

  app.post("/api/memory", ensureWritable, async (req, res) => {
    try {
      const db = getDb();
      const key = String(req.body.id || req.body.key || "").trim();
      if (!key) return res.status(400).json({ error: "key is required" });
      const now = Date.now();
      await db.run("INSERT INTO memory (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", key, req.body.value || "", now);
      const row = await db.get("SELECT key, value, updated_at, key AS id FROM memory WHERE key = ?", key);
      return res.status(201).json(row);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/memory/:id", ensureWritable, async (req, res) => {
    try {
      const db = getDb();
      const now = Date.now();
      await db.run("INSERT INTO memory (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", req.params.id, req.body.value || "", now);
      const row = await db.get("SELECT key, value, updated_at, key AS id FROM memory WHERE key = ?", req.params.id);
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/memory/:id", ensureWritable, async (req, res) => {
    try {
      const db = getDb();
      await db.run("DELETE FROM memory WHERE key = ?", req.params.id);
      res.json({ id: req.params.id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // state
  app.get("/api/state", async (req, res) => {
    try {
      const db = getDb();
      const { rows, total } = await runListQuery(db, req.query, {
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

  app.post("/api/state", ensureWritable, async (req, res) => {
    try {
      const db = getDb();
      const key = String(req.body.id || req.body.key || "").trim();
      if (!key) return res.status(400).json({ error: "key is required" });
      await db.run("INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", key, req.body.value || "", Date.now());
      const row = await db.get("SELECT key, value, updated_at, key AS id FROM state WHERE key = ?", key);
      return res.status(201).json(row);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/state/:id", ensureWritable, async (req, res) => {
    try {
      const db = getDb();
      await db.run("INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", req.params.id, req.body.value || "", Date.now());
      const row = await db.get("SELECT key, value, updated_at, key AS id FROM state WHERE key = ?", req.params.id);
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/state/:id", ensureWritable, async (req, res) => {
    try {
      const db = getDb();
      await db.run("DELETE FROM state WHERE key = ?", req.params.id);
      res.json({ id: req.params.id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // sessions
  app.get("/api/sessions", async (req, res) => {
    try {
      const db = getDb();
      const { rows, total } = await runListQuery(db, req.query, {
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

  app.post("/api/sessions", ensureWritable, async (req, res) => {
    try {
      const db = getDb();
      const sessionKey = String(req.body.id || req.body.session_key || "").trim();
      if (!sessionKey) return res.status(400).json({ error: "session_key is required" });
      const now = Date.now();
      await db.run("INSERT OR IGNORE INTO sessions (session_key, summary, created_at, updated_at) VALUES (?, ?, ?, ?)", sessionKey, req.body.summary || "", now, now);
      if (req.body.summary !== undefined) {
        await db.run("UPDATE sessions SET summary = ?, updated_at = ? WHERE session_key = ?", req.body.summary || "", now, sessionKey);
      }
      const row = await db.get("SELECT session_key, summary, created_at, updated_at, session_key AS id FROM sessions WHERE session_key = ?", sessionKey);
      return res.status(201).json(row);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/sessions/:id", ensureWritable, async (req, res) => {
    try {
      const db = getDb();
      const existing = await db.get("SELECT session_key, summary FROM sessions WHERE session_key = ?", req.params.id);
      if (!existing) return res.status(404).json({ error: "Not found" });
      await db.run("UPDATE sessions SET summary = ?, updated_at = ? WHERE session_key = ?", req.body.summary ?? existing.summary ?? "", Date.now(), req.params.id);
      const updated = await db.get("SELECT session_key, summary, created_at, updated_at, session_key AS id FROM sessions WHERE session_key = ?", req.params.id);
      return res.json(updated);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/sessions/:id", ensureWritable, async (req, res) => {
    try {
      const db = getDb();
      await db.run("DELETE FROM sessions WHERE session_key = ?", req.params.id);
      res.json({ id: req.params.id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // messages
  app.get("/api/messages", async (req, res) => {
    try {
      const db = getDb();
      const query = { ...req.query };
      if (query.q && typeof query.q === "string") {
        const ftsMatches = await db.all(
          "SELECT rowid FROM messages_fts WHERE messages_fts MATCH ? LIMIT 500",
          query.q,
        ).catch(() => []);

        if (ftsMatches.length > 0) {
          query.id = undefined;
          query.id_like = undefined;
          query.id_ne = undefined;
          query.q = undefined;
          query.ids = ftsMatches.map((row) => Number(row.rowid)).filter(Number.isFinite).join(",");
        }
      }

      const idsCsv = typeof query.ids === "string" ? query.ids : "";
      delete query.ids;

      if (idsCsv) {
        const ids = idsCsv
          .split(",")
          .map((v) => Number(v.trim()))
          .filter(Number.isFinite);

        if (ids.length === 0) {
          return sendList(res, [], 0);
        }

        const start = Math.max(0, toNumber(query._start, 0));
        const endRaw = toNumber(query._end, start + 10);
        const limit = Math.max(1, endRaw - start);
        const placeholders = ids.map(() => "?").join(",");

        const rows = await db.all(
          `SELECT id, session_key, role, content, tool_calls, tool_call_id, created_at
           FROM messages WHERE id IN (${placeholders})
           ORDER BY id DESC
           LIMIT ? OFFSET ?`,
          ...ids,
          limit,
          start,
        );

        return sendList(res, rows, ids.length);
      }

      const { rows, total } = await runListQuery(db, query, {
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
      const row = await db.get("SELECT id, session_key, role, content, tool_calls, tool_call_id, created_at FROM messages WHERE id = ?", req.params.id);
      row ? res.json(row) : res.status(404).json({ error: "Not found" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/messages", ensureWritable, async (req, res) => {
    try {
      const db = getDb();
      const sessionKey = String(req.body.session_key || "").trim();
      const role = String(req.body.role || "").trim();
      if (!sessionKey || !role) return res.status(400).json({ error: "session_key and role are required" });

      const session = await db.get("SELECT session_key FROM sessions WHERE session_key = ?", sessionKey);
      if (!session) return res.status(400).json({ error: `Unknown session_key: ${sessionKey}` });

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
      const row = await db.get("SELECT id, session_key, role, content, tool_calls, tool_call_id, created_at FROM messages WHERE id = ?", inserted.id);
      return res.status(201).json(row);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/messages/:id", ensureWritable, async (req, res) => {
    try {
      const db = getDb();
      const existing = await db.get("SELECT id, session_key, role, content, tool_calls, tool_call_id, created_at FROM messages WHERE id = ?", req.params.id);
      if (!existing) return res.status(404).json({ error: "Not found" });

      const nextSessionKey = req.body.session_key ?? existing.session_key;
      if (nextSessionKey !== existing.session_key) {
        const session = await db.get("SELECT session_key FROM sessions WHERE session_key = ?", nextSessionKey);
        if (!session) return res.status(400).json({ error: `Unknown session_key: ${nextSessionKey}` });
      }

      await db.run(
        "UPDATE messages SET session_key = ?, role = ?, content = ?, tool_calls = ?, tool_call_id = ?, created_at = ? WHERE id = ?",
        nextSessionKey,
        req.body.role ?? existing.role,
        req.body.content ?? existing.content,
        req.body.tool_calls ?? existing.tool_calls,
        req.body.tool_call_id ?? existing.tool_call_id,
        req.body.created_at ?? existing.created_at,
        req.params.id,
      );

      await db.run("UPDATE sessions SET updated_at = ? WHERE session_key IN (?, ?)", Date.now(), existing.session_key, nextSessionKey);

      const updated = await db.get("SELECT id, session_key, role, content, tool_calls, tool_call_id, created_at FROM messages WHERE id = ?", req.params.id);
      return res.json(updated);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/messages/bulk-delete", ensureWritable, async (req, res) => {
    try {
      const db = getDb();
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.map((v) => Number(v)).filter(Number.isFinite)
        : [];

      if (ids.length === 0) {
        return res.json({ deleted: 0 });
      }

      const placeholders = ids.map(() => "?").join(",");
      const result = await db.run(`DELETE FROM messages WHERE id IN (${placeholders})`, ...ids);
      return res.json({ deleted: result?.changes || 0 });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/messages/:id", ensureWritable, async (req, res) => {
    try {
      const db = getDb();
      await db.run("DELETE FROM messages WHERE id = ?", req.params.id);
      res.json({ id: Number(req.params.id) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // profiles docs
  app.post("/api/profiles-docs/sync", ensureWritable, async (_req, res) => {
    try {
      const db = getDb();
      const result = await syncProfilesFromFilesystem(db);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/profiles-docs", async (req, res) => {
    try {
      const db = getDb();
      const { rows, total } = await runListQuery(db, req.query, {
        selectSql: "SELECT id, profile, file_name, source_path, content, source_mtime, updated_at FROM profiles_docs",
        countSql: "SELECT COUNT(*) AS total FROM profiles_docs",
        allowedColumns: new Set(["id", "profile", "file_name", "source_path", "source_mtime", "updated_at"]),
        searchColumns: ["profile", "file_name", "source_path", "content"],
        fallbackSort: "updated_at DESC",
      });
      sendList(res, rows, total);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/profiles-docs/:id", async (req, res) => {
    try {
      const db = getDb();
      const row = await db.get("SELECT id, profile, file_name, source_path, content, source_mtime, updated_at FROM profiles_docs WHERE id = ?", req.params.id);
      row ? res.json(row) : res.status(404).json({ error: "Not found" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/profiles-docs", ensureWritable, async (req, res) => {
    try {
      const db = getDb();
      const profile = String(req.body.profile || "").trim();
      const fileName = String(req.body.file_name || "").trim();
      const sourcePath = String(req.body.source_path || "").trim();
      if (!profile || !fileName || !sourcePath) {
        return res.status(400).json({ error: "profile, file_name, source_path are required" });
      }

      const now = Date.now();
      await db.run(
        `
          INSERT INTO profiles_docs (profile, file_name, source_path, content, source_mtime, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        profile,
        fileName,
        sourcePath,
        req.body.content || "",
        toNumber(req.body.source_mtime, 0),
        now,
      );
      const inserted = await db.get("SELECT last_insert_rowid() AS id");
      const row = await db.get("SELECT id, profile, file_name, source_path, content, source_mtime, updated_at FROM profiles_docs WHERE id = ?", inserted.id);
      return res.status(201).json(row);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/profiles-docs/:id", ensureWritable, async (req, res) => {
    try {
      const db = getDb();
      const existing = await db.get("SELECT * FROM profiles_docs WHERE id = ?", req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Not found" });
      }

      await db.run(
        `
          UPDATE profiles_docs
          SET profile = ?, file_name = ?, source_path = ?, content = ?, source_mtime = ?, updated_at = ?
          WHERE id = ?
        `,
        req.body.profile ?? existing.profile,
        req.body.file_name ?? existing.file_name,
        req.body.source_path ?? existing.source_path,
        req.body.content ?? existing.content,
        req.body.source_mtime ?? existing.source_mtime,
        Date.now(),
        req.params.id,
      );

      const updated = await db.get("SELECT id, profile, file_name, source_path, content, source_mtime, updated_at FROM profiles_docs WHERE id = ?", req.params.id);
      return res.json(updated);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/profiles-docs/:id", ensureWritable, async (req, res) => {
    try {
      const db = getDb();
      await db.run("DELETE FROM profiles_docs WHERE id = ?", req.params.id);
      res.json({ id: Number(req.params.id) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  const frontendDistPath = path.resolve(__dirname, "../../../admin/frontend/dist");
  app.use(express.static(frontendDistPath));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(frontendDistPath, "index.html"));
  });

  (async () => {
    try {
      const db = getDb();
      await syncProfilesFromFilesystem(db);
    } catch (e) {
      console.warn("[admin] profiles sync skipped:", e.message || e);
    }
  })();

  const server = app.listen(port, () => {
    console.log(`✅ Admin panel → http://localhost:${port}`);
    console.log(`✅ Admin API   → http://localhost:${port}/api`);
    if (ADMIN_READ_ONLY) {
      console.log("🔒 Admin API write operations are disabled (ADMIN_READ_ONLY=true)");
    }
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
