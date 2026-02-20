const express = require("express");
const cors = require("cors");
const path = require("node:path");
const {
  getAllSettings,
  getSetting,
  setSetting,
  deleteSetting,
  getDb,
} = require("../../db/database");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function paginate(rows, req) {
  const start = Number(req.query._start) || 0;
  const end = Number(req.query._end) || rows.length;
  const _sort = req.query._sort;
  const _order = req.query._order;

  if (_sort) {
    rows.sort((a, b) => {
      if (a[_sort] < b[_sort]) return _order === "DESC" ? 1 : -1;
      if (a[_sort] > b[_sort]) return _order === "DESC" ? -1 : 1;
      return 0;
    });
  }

  const sliced = rows.slice(start, end);
  return { data: sliced, total: rows.length };
}

// ─── Router factory ───────────────────────────────────────────────────────────

function startAdminServer(port = 3000) {
  const app = express();
  app.use(
    cors({
      exposedHeaders: ["x-total-count"],
    }),
  );
  app.use(express.json());

  // ── Settings ──────────────────────────────────────────────────────────────

  app.get("/api/settings", async (req, res) => {
    try {
      const rows = (await getAllSettings()).map((r) => ({ ...r, id: r.key }));
      const { data, total } = paginate(rows, req);
      res.set("x-total-count", total).json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/settings/:id", async (req, res) => {
    try {
      const rows = await getAllSettings();
      const row = rows.find((r) => r.key === req.params.id);
      row ? res.json({ ...row, id: row.key }) : res.status(404).json({ error: "Not found" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const key = req.body.id || req.body.key;
      await setSetting(key, req.body.value || "", req.body.description || "");
      const rows = await getAllSettings();
      const row = rows.find((r) => r.key === key);
      res.status(201).json({ ...row, id: row.key });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/settings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      // Fetch existing description if not supplied
      const rows = await getAllSettings();
      const existing = rows.find((r) => r.key === id) || {};
      await setSetting(
        id,
        req.body.value ?? existing.value ?? "",
        req.body.description ?? existing.description ?? ""
      );
      const updated = (await getAllSettings()).find((r) => r.key === id);
      res.json({ ...updated, id: updated.key });
    } catch (e) {
      res.status(500).json({ error: e.message });
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
      const rows = (await db.all("SELECT key, value, updated_at FROM memory ORDER BY updated_at DESC")).map((r) => ({
        ...r,
        id: r.key,
      }));
      const { data, total } = paginate(rows, req);
      res.set("x-total-count", total).json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/memory/:id", async (req, res) => {
    try {
      const db = getDb();
      const row = await db.get("SELECT key, value, updated_at FROM memory WHERE key = ?", req.params.id);
      row ? res.json({ ...row, id: row.key }) : res.status(404).json({ error: "Not found" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/memory", async (req, res) => {
    try {
      const db = getDb();
      const key = req.body.id || req.body.key;
      const now = Date.now();
      await db.run(
        "INSERT INTO memory (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        key, req.body.value || "", now
      );
      const row = await db.get("SELECT key, value, updated_at FROM memory WHERE key = ?", key);
      res.status(201).json({ ...row, id: row.key });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/memory/:id", async (req, res) => {
    try {
      const db = getDb();
      const now = Date.now();
      await db.run(
        "INSERT INTO memory (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        req.params.id, req.body.value || "", now
      );
      const row = await db.get("SELECT key, value, updated_at FROM memory WHERE key = ?", req.params.id);
      res.json({ ...row, id: row.key });
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
      const rows = (await db.all("SELECT key, value, updated_at FROM state ORDER BY key ASC")).map((r) => ({
        ...r,
        id: r.key,
      }));
      const { data, total } = paginate(rows, req);
      res.set("x-total-count", total).json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/state/:id", async (req, res) => {
    try {
      const db = getDb();
      const row = await db.get("SELECT key, value, updated_at FROM state WHERE key = ?", req.params.id);
      row ? res.json({ ...row, id: row.key }) : res.status(404).json({ error: "Not found" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/state/:id", async (req, res) => {
    try {
      const db = getDb();
      await db.run(
        "INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        req.params.id, req.body.value || "", Date.now()
      );
      const row = await db.get("SELECT key, value, updated_at FROM state WHERE key = ?", req.params.id);
      res.json({ ...row, id: row.key });
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
      const rows = (await db.all("SELECT session_key, summary, created_at, updated_at FROM sessions ORDER BY updated_at DESC")).map((r) => ({
        ...r,
        id: r.session_key,
      }));
      const { data, total } = paginate(rows, req);
      res.set("x-total-count", total).json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const db = getDb();
      const row = await db.get("SELECT session_key, summary, created_at, updated_at FROM sessions WHERE session_key = ?", req.params.id);
      row ? res.json({ ...row, id: row.session_key }) : res.status(404).json({ error: "Not found" });
    } catch (e) {
      res.status(500).json({ error: e.message });
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

  // ── Messages (read-only list, delete) ─────────────────────────────────────

  app.get("/api/messages", async (req, res) => {
    try {
      const db = getDb();
      const filter = req.query.session_key;
      const sql = filter
        ? "SELECT id, session_key, role, content, created_at FROM messages WHERE session_key = ? ORDER BY id ASC"
        : "SELECT id, session_key, role, content, created_at FROM messages ORDER BY id DESC";
      const args = filter ? [filter] : [];
      const rows = await db.all(sql, ...args);
      const { data, total } = paginate(rows, req);
      res.set("x-total-count", total).json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/messages/:id", async (req, res) => {
    try {
      const db = getDb();
      const row = await db.get("SELECT id, session_key, role, content, created_at FROM messages WHERE id = ?", req.params.id);
      row ? res.json(row) : res.status(404).json({ error: "Not found" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/messages/:id", async (req, res) => {
    try {
      const db = getDb();
      await db.run("DELETE FROM messages WHERE id = ?", req.params.id);
      res.json({ id: req.params.id });
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
