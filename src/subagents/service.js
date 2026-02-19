const crypto = require("crypto");

class SubagentService {
  constructor(options = {}) {
    this.tasks = new Map();
    this.runner = null;
    this.started = false;
    this.cleanupTimer = null;
    this.defaultTimeoutMs = Math.max(
      5000,
      Number(options.defaultTimeoutMs || Number(process.env.SUBAGENT_MAX_SECONDS || 120) * 1000),
    );
    this.maxTaskLength = Number(options.maxTaskLength || 8000);
    this.maxConcurrentPerSession = Math.max(
      1,
      Number(
        options.maxConcurrentPerSession ||
          process.env.SUBAGENT_MAX_CONCURRENT ||
          3,
      ),
    );
    this.retentionMs =
      Math.max(1, Number(options.retentionHours || process.env.SUBAGENT_RETENTION_HOURS || 24)) *
      60 *
      60 *
      1000;
    this.cleanupIntervalMs = Math.max(
      60 * 1000,
      Number(
        options.cleanupIntervalMs ||
          process.env.SUBAGENT_CLEANUP_INTERVAL_MS ||
          10 * 60 * 1000,
      ),
    );
  }

  setRunner(runner) {
    this.runner = runner;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.cleanupTimer = setInterval(() => {
      try {
        this.cleanup();
      } catch (err) {
        console.error("[subagent] cleanup failed:", err.message);
      }
    }, this.cleanupIntervalMs);
  }

  stop() {
    this.started = false;
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  async spawn(task, context = {}) {
    if (typeof this.runner !== "function") {
      throw new Error("Subagent runner is not configured");
    }

    const text = String(task || "").trim();
    if (!text) throw new Error("task is required");
    if (text.length > this.maxTaskLength) {
      throw new Error(`task is too long (max ${this.maxTaskLength} chars)`);
    }

    const sessionKey = String(context.sessionKey || "");
    const activeForSession = this._countActiveForSession(sessionKey);
    if (activeForSession >= this.maxConcurrentPerSession) {
      throw new Error(
        `too many active subagents for session (limit: ${this.maxConcurrentPerSession})`,
      );
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    const item = {
      id,
      task: text,
      status: "queued",
      result: "",
      error: "",
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
      parentSessionKey: String(context.sessionKey || ""),
      channel: String(context.channel || ""),
      chatId: String(context.chatId || ""),
    };

    this.tasks.set(id, item);
    this._run(id).catch((err) => {
      console.error("[subagent] run failed:", err.message);
    });

    return { ...item };
  }

  get(id) {
    const item = this.tasks.get(String(id || ""));
    return item ? { ...item } : null;
  }

  listBySession(sessionKey) {
    const sk = String(sessionKey || "");
    const rows = [];
    for (const item of this.tasks.values()) {
      if (item.parentSessionKey !== sk) continue;
      rows.push({ ...item });
    }
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  }

  cleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [id, item] of this.tasks.entries()) {
      const isTerminal = item.status === "completed" || item.status === "failed";
      if (!isTerminal) continue;
      if (now - Number(item.updatedAt || item.createdAt || now) < this.retentionMs) {
        continue;
      }
      this.tasks.delete(id);
      removed += 1;
    }
    return removed;
  }

  async _run(id) {
    const item = this.tasks.get(id);
    if (!item) return;

    item.status = "running";
    item.startedAt = Date.now();
    item.updatedAt = item.startedAt;

    try {
      const result = await Promise.race([
        this.runner({ ...item }),
        new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error(`Subagent timeout after ${this.defaultTimeoutMs}ms`)),
            this.defaultTimeoutMs,
          );
        }),
      ]);

      item.status = "completed";
      item.result = String(result || "");
      item.finishedAt = Date.now();
      item.updatedAt = item.finishedAt;
    } catch (err) {
      item.status = "failed";
      item.error = String(err && err.message ? err.message : err || "Unknown error");
      item.finishedAt = Date.now();
      item.updatedAt = item.finishedAt;
    }
  }

  _countActiveForSession(sessionKey) {
    let count = 0;
    for (const item of this.tasks.values()) {
      if (item.parentSessionKey !== sessionKey) continue;
      if (item.status === "queued" || item.status === "running") {
        count += 1;
      }
    }
    return count;
  }
}

module.exports = { SubagentService };
