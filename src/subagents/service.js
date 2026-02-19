const crypto = require("crypto");

class SubagentService {
  constructor(options = {}) {
    this.tasks = new Map();
    this.runner = null;
    this.defaultTimeoutMs = Math.max(
      5000,
      Number(options.defaultTimeoutMs || Number(process.env.SUBAGENT_MAX_SECONDS || 120) * 1000),
    );
    this.maxTaskLength = Number(options.maxTaskLength || 8000);
  }

  setRunner(runner) {
    this.runner = runner;
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
}

module.exports = { SubagentService };
