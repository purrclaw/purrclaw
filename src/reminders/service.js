const crypto = require("crypto");
const { getState, setState } = require("../db/database");

const STATE_KEY = "reminders:v1";

class ReminderService {
  constructor() {
    this.timers = new Map();
    this.notifier = null;
    this.started = false;
  }

  setNotifier(notifier) {
    this.notifier = notifier;
  }

  async start() {
    if (this.started) return;
    this.started = true;
    const all = await this._loadAll();
    for (const reminder of all.filter((r) => r.status === "pending")) {
      this._schedule(reminder);
    }
  }

  async create({ sessionKey, channel, chatId, text, inSeconds }) {
    const seconds = Math.max(5, Math.min(Number(inSeconds || 60), 60 * 60 * 24 * 30));
    const now = Date.now();
    const reminder = {
      id: crypto.randomUUID(),
      sessionKey,
      channel,
      chatId,
      text: String(text || "Reminder").trim(),
      dueAt: now + seconds * 1000,
      createdAt: now,
      status: "pending",
    };

    const all = await this._loadAll();
    all.push(reminder);
    await this._saveAll(all);
    this._schedule(reminder);
    return reminder;
  }

  async listBySession(sessionKey) {
    const all = await this._loadAll();
    return all
      .filter((r) => r.sessionKey === sessionKey && r.status === "pending")
      .sort((a, b) => a.dueAt - b.dueAt);
  }

  async deleteById(id, sessionKey) {
    const all = await this._loadAll();
    const idx = all.findIndex((r) => r.id === id && (!sessionKey || r.sessionKey === sessionKey));
    if (idx < 0) return false;
    all[idx].status = "cancelled";
    await this._saveAll(all);
    this._clearTimer(id);
    return true;
  }

  _schedule(reminder) {
    this._clearTimer(reminder.id);
    const delay = Math.max(0, reminder.dueAt - Date.now());
    const timer = setTimeout(() => {
      this._trigger(reminder.id).catch((err) => {
        console.error("[reminder] Trigger failed:", err.message);
      });
    }, delay);
    this.timers.set(reminder.id, timer);
  }

  _clearTimer(id) {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  async _trigger(id) {
    this._clearTimer(id);
    const all = await this._loadAll();
    const reminder = all.find((r) => r.id === id);
    if (!reminder || reminder.status !== "pending") return;

    if (typeof this.notifier === "function") {
      const text = `⏰ Reminder: ${reminder.text}`;
      try {
        await this.notifier({
          channel: reminder.channel,
          chatId: reminder.chatId,
          text,
          meta: {},
        });
      } catch (err) {
        console.error("[reminder] Notify failed:", err.message);
      }
    }

    reminder.status = "sent";
    await this._saveAll(all);
  }

  async _loadAll() {
    const raw = await getState(STATE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async _saveAll(items) {
    await setState(STATE_KEY, JSON.stringify(items));
  }
}

module.exports = { ReminderService };
