"use strict";

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

let db;

function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

function initDb(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_key TEXT PRIMARY KEY,
      summary     TEXT DEFAULT '',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_key TEXT NOT NULL,
      role        TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      tool_calls  TEXT DEFAULT NULL,
      tool_call_id TEXT DEFAULT NULL,
      created_at  INTEGER NOT NULL,
      FOREIGN KEY (session_key) REFERENCES sessions(session_key) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_key, id);

    CREATE TABLE IF NOT EXISTS memory (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS state (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  return db;
}

// ─── Sessions ────────────────────────────────────────────────────────────────

function getOrCreateSession(sessionKey) {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `
    INSERT OR IGNORE INTO sessions (session_key, summary, created_at, updated_at)
    VALUES (?, '', ?, ?)
  `,
  ).run(sessionKey, now, now);
  return db
    .prepare("SELECT * FROM sessions WHERE session_key = ?")
    .get(sessionKey);
}

function getSessionHistory(sessionKey) {
  const db = getDb();
  getOrCreateSession(sessionKey);
  const rows = db
    .prepare("SELECT * FROM messages WHERE session_key = ? ORDER BY id ASC")
    .all(sessionKey);

  return rows.map((row) => {
    const msg = { role: row.role, content: row.content };
    if (row.tool_calls) {
      try {
        msg.tool_calls = JSON.parse(row.tool_calls);
      } catch {}
    }
    if (row.tool_call_id) {
      msg.tool_call_id = row.tool_call_id;
    }
    return msg;
  });
}

function addMessage(
  sessionKey,
  role,
  content,
  toolCalls = null,
  toolCallId = null,
) {
  const db = getDb();
  getOrCreateSession(sessionKey);
  const now = Date.now();
  db.prepare(
    `
    INSERT INTO messages (session_key, role, content, tool_calls, tool_call_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(
    sessionKey,
    role,
    content || "",
    toolCalls ? JSON.stringify(toolCalls) : null,
    toolCallId || null,
    now,
  );
  db.prepare("UPDATE sessions SET updated_at = ? WHERE session_key = ?").run(
    now,
    sessionKey,
  );
}

function getSessionSummary(sessionKey) {
  const db = getDb();
  const row = db
    .prepare("SELECT summary FROM sessions WHERE session_key = ?")
    .get(sessionKey);
  return row ? row.summary || "" : "";
}

function setSessionSummary(sessionKey, summary) {
  const db = getDb();
  getOrCreateSession(sessionKey);
  db.prepare(
    "UPDATE sessions SET summary = ?, updated_at = ? WHERE session_key = ?",
  ).run(summary, Date.now(), sessionKey);
}

function truncateHistory(sessionKey, keepLast) {
  const db = getDb();
  const rows = db
    .prepare("SELECT id FROM messages WHERE session_key = ? ORDER BY id ASC")
    .all(sessionKey);

  if (rows.length <= keepLast) return;

  const toDelete = rows.slice(0, rows.length - keepLast).map((r) => r.id);
  const placeholders = toDelete.map(() => "?").join(",");
  db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).run(
    ...toDelete,
  );
}

function setHistory(sessionKey, messages) {
  const db = getDb();
  getOrCreateSession(sessionKey);
  db.prepare("DELETE FROM messages WHERE session_key = ?").run(sessionKey);
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO messages (session_key, role, content, tool_calls, tool_call_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const msg of messages) {
    stmt.run(
      sessionKey,
      msg.role,
      msg.content || "",
      msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
      msg.tool_call_id || null,
      now,
    );
  }
  db.prepare("UPDATE sessions SET updated_at = ? WHERE session_key = ?").run(
    now,
    sessionKey,
  );
}

// ─── Memory ──────────────────────────────────────────────────────────────────

function getMemory(key) {
  const db = getDb();
  const row = db.prepare("SELECT value FROM memory WHERE key = ?").get(key);
  return row ? row.value : null;
}

function setMemory(key, value) {
  const db = getDb();
  db.prepare(
    `
    INSERT INTO memory (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `,
  ).run(key, value, Date.now());
}

// ─── State ───────────────────────────────────────────────────────────────────

function getState(key) {
  const db = getDb();
  const row = db.prepare("SELECT value FROM state WHERE key = ?").get(key);
  return row ? row.value : null;
}

function setState(key, value) {
  const db = getDb();
  db.prepare(
    `
    INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `,
  ).run(key, value, Date.now());
}

module.exports = {
  initDb,
  getDb,
  // sessions
  getOrCreateSession,
  getSessionHistory,
  addMessage,
  getSessionSummary,
  setSessionSummary,
  truncateHistory,
  setHistory,
  // memory
  getMemory,
  setMemory,
  // state
  getState,
  setState,
};
