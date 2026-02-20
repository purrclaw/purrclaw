
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const fs = require("fs");

let db;
let dbInitPromise;

function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

async function initDb(dbPath) {
  if (db) {
    return db;
  }
  if (dbInitPromise) {
    return dbInitPromise;
  }

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  dbInitPromise = (async () => {
    const instance = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    await instance.exec("PRAGMA journal_mode = WAL;");
    await instance.exec("PRAGMA foreign_keys = ON;");

    await instance.exec(`
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

    CREATE TABLE IF NOT EXISTS settings (
      key           TEXT PRIMARY KEY,
      value         TEXT NOT NULL,
      description   TEXT,
      updated_at    INTEGER NOT NULL
    );
  `);

    db = instance;
    return db;
  })();

  try {
    return await dbInitPromise;
  } finally {
    dbInitPromise = null;
  }
}

// ─── Sessions ────────────────────────────────────────────────────────────────

async function getOrCreateSession(sessionKey) {
  const db = getDb();
  const now = Date.now();
  await db.run(
    `
    INSERT OR IGNORE INTO sessions (session_key, summary, created_at, updated_at)
    VALUES (?, '', ?, ?)
  `,
    sessionKey,
    now,
    now,
  );
  return db.get("SELECT * FROM sessions WHERE session_key = ?", sessionKey);
}

async function getSessionHistory(sessionKey) {
  const db = getDb();
  await getOrCreateSession(sessionKey);
  const rows = await db.all(
    "SELECT * FROM messages WHERE session_key = ? ORDER BY id ASC",
    sessionKey,
  );

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

async function addMessage(
  sessionKey,
  role,
  content,
  toolCalls = null,
  toolCallId = null,
) {
  const db = getDb();
  await getOrCreateSession(sessionKey);
  const now = Date.now();
  await db.run(
    `
    INSERT INTO messages (session_key, role, content, tool_calls, tool_call_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
    sessionKey,
    role,
    content || "",
    toolCalls ? JSON.stringify(toolCalls) : null,
    toolCallId || null,
    now,
  );
  await db.run(
    "UPDATE sessions SET updated_at = ? WHERE session_key = ?",
    now,
    sessionKey,
  );
}

async function getSessionSummary(sessionKey) {
  const db = getDb();
  const row = await db.get(
    "SELECT summary FROM sessions WHERE session_key = ?",
    sessionKey,
  );
  return row ? row.summary || "" : "";
}

async function setSessionSummary(sessionKey, summary) {
  const db = getDb();
  await getOrCreateSession(sessionKey);
  await db.run(
    "UPDATE sessions SET summary = ?, updated_at = ? WHERE session_key = ?",
    summary,
    Date.now(),
    sessionKey,
  );
}

async function truncateHistory(sessionKey, keepLast) {
  const db = getDb();
  const rows = await db.all(
    "SELECT id FROM messages WHERE session_key = ? ORDER BY id ASC",
    sessionKey,
  );

  if (rows.length <= keepLast) return;

  const toDelete = rows.slice(0, rows.length - keepLast).map((r) => r.id);
  const placeholders = toDelete.map(() => "?").join(",");
  await db.run(
    `DELETE FROM messages WHERE id IN (${placeholders})`,
    ...toDelete,
  );
}

async function setHistory(sessionKey, messages) {
  const db = getDb();
  await getOrCreateSession(sessionKey);
  await db.run("DELETE FROM messages WHERE session_key = ?", sessionKey);
  const now = Date.now();
  for (const msg of messages) {
    await db.run(
      "INSERT INTO messages (session_key, role, content, tool_calls, tool_call_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      sessionKey,
      msg.role,
      msg.content || "",
      msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
      msg.tool_call_id || null,
      now,
    );
  }
  await db.run(
    "UPDATE sessions SET updated_at = ? WHERE session_key = ?",
    now,
    sessionKey,
  );
}

// ─── Memory ──────────────────────────────────────────────────────────────────

async function getMemory(key) {
  const db = getDb();
  const row = await db.get("SELECT value FROM memory WHERE key = ?", key);
  return row ? row.value : null;
}

async function setMemory(key, value) {
  const db = getDb();
  await db.run(
    `
    INSERT INTO memory (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `,
    key,
    value,
    Date.now(),
  );
}

async function listMemory(limit = 200) {
  const db = getDb();
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(limit, 1000))
    : 200;
  return db.all(
    "SELECT key, value, updated_at FROM memory ORDER BY updated_at DESC LIMIT ?",
    safeLimit,
  );
}

async function deleteMemory(key) {
  const db = getDb();
  const result = await db.run("DELETE FROM memory WHERE key = ?", key);
  return (result && result.changes) || 0;
}

// ─── State ───────────────────────────────────────────────────────────────────

async function getState(key) {
  const db = getDb();
  const row = await db.get("SELECT value FROM state WHERE key = ?", key);
  return row ? row.value : null;
}

async function setState(key, value) {
  const db = getDb();
  await db.run(
    `
    INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `,
    key,
    value,
    Date.now(),
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────

async function getAllSettings() {
  const db = getDb();
  return db.all("SELECT key, value, description, updated_at FROM settings");
}

async function getSetting(key) {
  const db = getDb();
  const row = await db.get("SELECT value FROM settings WHERE key = ?", key);
  return row ? row.value : null;
}

async function setSetting(key, value, description = "") {
  const db = getDb();
  await db.run(
    `
    INSERT INTO settings (key, value, description, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, description = excluded.description, updated_at = excluded.updated_at
  `,
    key,
    value,
    description,
    Date.now(),
  );
}

async function deleteSetting(key) {
  const db = getDb();
  const result = await db.run("DELETE FROM settings WHERE key = ?", key);
  return (result?.changes) || 0;
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
  listMemory,
  deleteMemory,
  // state
  getState,
  setState,
  // settings
  getAllSettings,
  getSetting,
  setSetting,
  deleteSetting,
};
