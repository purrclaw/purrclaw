const fs = require("fs");
const path = require("path");
const { TelegramClient, Api } = require("telegram");
const { NewMessage } = require("telegram/events");
const { StringSession } = require("telegram/sessions");
const { deleteMemory, getMemory } = require("../db/database");

function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseAllowedPeers(raw) {
  const set = new Set();
  if (!raw || !raw.trim()) return set;

  for (const item of raw.split(",")) {
    const token = String(item || "").trim();
    if (!token) continue;

    set.add(token);

    if (token.startsWith("@")) {
      const uname = token.slice(1).toLowerCase();
      if (uname) {
        set.add(uname);
        set.add(`@${uname}`);
      }
      continue;
    }

    if (/^[a-zA-Z][a-zA-Z0-9_]{4,}$/.test(token)) {
      const uname = token.toLowerCase();
      set.add(uname);
      set.add(`@${uname}`);
    }
  }

  return set;
}

function normalizeText(text) {
  return String(text || "").trim();
}

function isSecretEnvKey(key) {
  return /(KEY|TOKEN|SECRET|PASSWORD|HASH|SESSION)/i.test(String(key || ""));
}

function sleep(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class TelegramUserChannel {
  constructor(config, agentLoop) {
    this.name = "telegram_user";
    this.agentLoop = agentLoop;
    this.apiId = Number(config.apiId || 0);
    this.apiHash = String(config.apiHash || "");
    this.allowedPeers = parseAllowedPeers(config.allowedPeers || "");
    this.sessionMemoryKey = "telegram:user_session";
    this.client = null;
    this.selfId = null;
    this.secretValues = [];
    this.ignoreBotSenders =
      String(process.env.TELEGRAM_USER_IGNORE_BOT_SENDERS || "true")
        .trim()
        .toLowerCase() !== "false";
    this.botLoopDelayMs = Math.max(
      0,
      Number(process.env.TELEGRAM_USER_BOT_LOOP_DELAY_MS || 2000),
    );
    this.botLoopMaxTurns = Math.max(
      0,
      Number(process.env.TELEGRAM_USER_BOT_LOOP_MAX_TURNS || 8),
    );
    this.botLoopTurns = new Map();
    this.botLoopPaused = new Set();
    this.forcedProfileHint = this._normalizeProfileHint(
      process.env.TELEGRAM_USER_PROFILE_HINT || "",
    );
    this.profileDebug =
      String(process.env.TELEGRAM_USER_PROFILE_DEBUG || "false")
        .trim()
        .toLowerCase() !== "false";
    this.typingEnabled =
      String(process.env.TELEGRAM_USER_TYPING_INDICATOR || "true")
        .trim()
        .toLowerCase() !== "false";
    this.selfProfileHint = "";
    this.workspace = path.resolve(
      this.agentLoop?.workspace || process.env.WORKSPACE_DIR || "./workspace",
    );
  }

  _normalizeProfileHint(raw) {
    const value = String(raw || "").trim().toLowerCase();
    if (!value) return "";

    if (value.startsWith("telegram_user_@")) {
      return value.replace(/[^a-z0-9_@.-]/g, "_");
    }

    if (value.startsWith("@")) {
      const uname = value.slice(1).replace(/[^a-z0-9_]/g, "");
      return uname ? `telegram_user_@${uname}` : "";
    }

    if (/^[a-z0-9_]+$/.test(value)) {
      return `telegram_user_@${value}`;
    }

    return "";
  }

  _isBotSender(sender, username) {
    if (sender && sender.bot === true) return true;
    const uname = String(username || "").trim().toLowerCase();
    if (uname && uname.endsWith("bot")) return true;
    return false;
  }

  _resetLoopState(chatId) {
    const key = String(chatId || "");
    if (!key) return;
    this.botLoopTurns.delete(key);
    this.botLoopPaused.delete(key);
  }

  _nextBotLoopTurn(chatId) {
    const key = String(chatId || "");
    const prev = Number(this.botLoopTurns.get(key) || 0);
    const next = prev + 1;
    this.botLoopTurns.set(key, next);
    return next;
  }

  _refreshSecretValues(extra = []) {
    const values = [];

    for (const [key, value] of Object.entries(process.env)) {
      if (!isSecretEnvKey(key)) continue;
      const v = String(value || "").trim();
      if (!v) continue;
      values.push(v);
    }

    const fsPassword = String(
      process.env.FS_ACCESS_PASSWORD || "",
    ).trim();
    if (fsPassword) values.push(fsPassword);

    for (const item of extra) {
      const v = String(item || "").trim();
      if (!v) continue;
      values.push(v);
    }

    this.secretValues = Array.from(
      new Set(values.filter((v) => v.length >= 6)),
    ).sort((a, b) => b.length - a.length);
  }

  _sanitizeOutgoing(text) {
    let out = String(text || "");

    for (const value of this.secretValues) {
      const escaped = escapeRegex(value);
      if (!escaped) continue;
      out = out.replace(new RegExp(escaped, "g"), "[REDACTED]");
    }

    out = out
      .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]")
      .replace(/\b\d{7,10}:[A-Za-z0-9_-]{20,}\b/g, "[REDACTED]")
      .replace(
        /(api[_-]?key|token|secret|password|session|hash)\s*[:=]\s*([^\s,;]+)/gi,
        "$1=[REDACTED]",
      );

    return out;
  }

  _buildProfileHint(username) {
    const uname = String(username || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
    if (!uname) return "telegram_user";
    return `telegram_user_@${uname}`;
  }

  _profileDirExists(profileHint) {
    const hint = String(profileHint || "").trim();
    if (!hint) return false;
    const dir = path.join(this.workspace, "profiles", hint);
    return fs.existsSync(dir);
  }

  _pickProfileHint(candidates = []) {
    const uniq = [];
    const seen = new Set();
    for (const raw of candidates) {
      const hint = String(raw || "").trim();
      if (!hint || seen.has(hint)) continue;
      seen.add(hint);
      uniq.push(hint);
    }

    if (this.profileDebug) {
      const checks = uniq.map((hint) => {
        const exists = this._profileDirExists(hint);
        return `${hint}:${exists ? "hit" : "miss"}`;
      });
      console.log(
        `[telegram_user] profile_candidates=${checks.join(", ") || "(none)"}`,
      );
    }

    for (const hint of uniq) {
      if (this._profileDirExists(hint)) {
        if (this.profileDebug) {
          console.log(`[telegram_user] profile_selected=${hint}`);
        }
        return hint;
      }
    }

    if (this.profileDebug) {
      console.log(`[telegram_user] profile_selected=${uniq[0] || "telegram_user"} (fallback)`);
    }
    return uniq[0] || "telegram_user";
  }

  _selectProfileHint(senderUsername) {
    const senderProfileHint = this._buildProfileHint(senderUsername);
    return this._pickProfileHint([
      this.forcedProfileHint,
      this.selfProfileHint,
      senderProfileHint,
      "telegram_user",
    ]);
  }

  _buildSessionKey(chatId, profileHint) {
    const chat = String(chatId || "").trim();
    const raw = String(profileHint || "").trim().toLowerCase();
    const hint =
      raw === "telegram_user"
        ? "telegram_user"
        : this._normalizeProfileHint(profileHint) || "telegram_user";
    return `telegram_user:${chat}:${hint}`;
  }

  _collectResetSessionKeys(chatId, senderUsername) {
    const chat = String(chatId || "").trim();
    if (!chat) return [];

    const keys = new Set();
    keys.add(`telegram_user:${chat}`);
    keys.add(this._buildSessionKey(chat, "telegram_user"));

    if (this.forcedProfileHint) {
      keys.add(this._buildSessionKey(chat, this.forcedProfileHint));
    }
    if (this.selfProfileHint) {
      keys.add(this._buildSessionKey(chat, this.selfProfileHint));
    }

    const senderHint = this._buildProfileHint(senderUsername || "");
    if (senderHint) {
      keys.add(this._buildSessionKey(chat, senderHint));
    }

    return Array.from(keys);
  }

  _peerAllowed(chatId, fromId, username) {
    if (this.allowedPeers.size === 0) return true;

    const candidates = [
      String(chatId || ""),
      String(fromId || ""),
      username ? String(username) : "",
      username ? `@${username}` : "",
    ].filter(Boolean);

    for (const token of candidates) {
      if (this.allowedPeers.has(token)) return true;

      if (token.startsWith("@")) {
        const uname = token.slice(1).toLowerCase();
        if (this.allowedPeers.has(uname) || this.allowedPeers.has(`@${uname}`)) {
          return true;
        }
        continue;
      }

      if (/^[a-zA-Z][a-zA-Z0-9_]{4,}$/.test(token)) {
        const uname = token.toLowerCase();
        if (this.allowedPeers.has(uname) || this.allowedPeers.has(`@${uname}`)) {
          return true;
        }
      }
    }

    return false;
  }

  async _send(chatId, text) {
    const out = this._sanitizeOutgoing(text);
    const maxLength = 4096;
    for (let i = 0; i < out.length; i += maxLength) {
      await this.client.sendMessage(chatId, { message: out.slice(i, i + maxLength) });
    }
  }

  async _resolveInputPeer(chatId, msg = null) {
    if (!this.client) return null;
    if (msg && msg.peerId) {
      try {
        return await this.client.getInputEntity(msg.peerId);
      } catch {}
    }
    try {
      return await this.client.getInputEntity(chatId);
    } catch {
      return null;
    }
  }

  async _sendTyping(chatId, msg = null) {
    if (!this.typingEnabled || !this.client) return;
    const peer = await this._resolveInputPeer(chatId, msg);
    if (!peer) return;
    await this.client.invoke(
      new Api.messages.SetTyping({
        peer,
        action: new Api.SendMessageTypingAction(),
      }),
    );
  }

  _startTyping(chatId, msg = null) {
    if (!this.typingEnabled || !this.client) {
      return () => {};
    }

    let stopped = false;
    let timer = null;

    const tick = async () => {
      if (stopped) return;
      try {
        await this._sendTyping(chatId, msg);
      } catch (err) {
        if (this.profileDebug) {
          console.warn(`[telegram_user] typing failed in chat ${chatId}: ${err.message}`);
        }
      }
      if (!stopped) {
        timer = setTimeout(tick, 4000);
      }
    };

    tick().catch(() => {});

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }

  async _revoke(chatId) {
    try {
      await this.client.invoke(new Api.auth.LogOut());
    } catch (err) {
      console.warn("[telegram_user] Logout warning:", err.message);
    }

    await deleteMemory(this.sessionMemoryKey);

    if (chatId) {
      await this._send(chatId, "Session revoked and deleted. Run `npm run telegram:user:login` to authorize again.");
    }

    try {
      await this.client.disconnect();
    } catch {}

    this.client = null;
    console.log("[telegram_user] Session revoked");
  }

  async _onMessage(event) {
    if (!event || !event.message) return;

    const msg = event.message;
    const text = normalizeText(msg.message);
    if (!text) return;

    const chatId = String(msg.chatId || "");
    const fromId = String(msg.senderId || "");
    let username = "";
    let sender = msg.sender || null;
    if (!sender && typeof msg.getSender === "function") {
      sender = await msg.getSender().catch(() => null);
    }
    if (sender && sender.username) {
      username = String(sender.username);
    }
    const profileHint = this._selectProfileHint(username);
    const sessionKey = this._buildSessionKey(chatId, profileHint);

    if (msg.out && text === "/reset") {
      const keys = this._collectResetSessionKeys(chatId, username);
      for (const key of keys) {
        await this.agentLoop.resetSession(key);
      }
      await this._send(chatId, `Conversation reset (${keys.length} session scope(s)).`);
      return;
    }

    if (msg.out && text === "/revoke_session") {
      await this._revoke(chatId);
      return;
    }

    if (msg.out && text === "/loop_reset") {
      this._resetLoopState(chatId);
      await this._send(chatId, "🔁 Loop state reset. Bot-to-bot test can continue.");
      return;
    }

    if (msg.out) return;

    const botSender = this._isBotSender(sender, username);

    if (this.ignoreBotSenders && botSender) {
      console.log(
        `[telegram_user] Ignored bot sender in chat ${chatId}: ${username || fromId || "unknown"}`,
      );
      return;
    }

    if (!botSender) {
      this._resetLoopState(chatId);
    } else {
      if (this.botLoopPaused.has(chatId)) {
        return;
      }

      const turn = this._nextBotLoopTurn(chatId);
      if (this.botLoopMaxTurns > 0 && turn > this.botLoopMaxTurns) {
        this.botLoopPaused.add(chatId);
        console.warn(
          `[telegram_user] Bot loop paused in chat ${chatId} after ${this.botLoopMaxTurns} turns`,
        );
        await this._send(
          chatId,
          `🔁 Loop paused after ${this.botLoopMaxTurns} bot turns. Send /loop_reset to continue.`,
        );
        return;
      }

      await sleep(this.botLoopDelayMs);
    }

    if (!this._peerAllowed(chatId, fromId, username)) {
      console.warn(`[telegram_user] Rejected message from peer ${fromId || "unknown"} in chat ${chatId}`);
      return;
    }

    console.log(`[telegram_user] Message in chat ${chatId}: ${text.slice(0, 80)}`);

    const stopTyping = this._startTyping(chatId, msg);
    try {
      console.log(`[telegram_user] profile_hint=${profileHint}`);
      console.log(`[telegram_user] session_key=${sessionKey}`);
      const response = await this.agentLoop.processMessage(
        sessionKey,
        text,
        this.name,
        chatId,
        {
          profileHint,
        },
      );
      await this._send(chatId, response);
    } catch (err) {
      console.error("[telegram_user] Error processing message:", err);
      await this._send(chatId, `Error: ${err.message}`);
    } finally {
      stopTyping();
    }
  }

  async start() {
    if (!this.apiId || !this.apiHash) {
      throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH are required for telegram_user channel");
    }

    const session = (await getMemory(this.sessionMemoryKey)) || process.env.TELEGRAM_USER_SESSION || "";

    if (!session) {
      throw new Error("No telegram user session found. Run: npm run telegram:user:login");
    }

    const stringSession = new StringSession(session);
    const client = new TelegramClient(stringSession, this.apiId, this.apiHash, {
      connectionRetries: 5,
    });

    await client.connect();
    const me = await client.getMe();
    this.selfId = String(me?.id || "");
    this.selfProfileHint = this._buildProfileHint(me?.username || "");
    this.client = client;
    this._refreshSecretValues([session]);

    this.client.addEventHandler((event) => this._onMessage(event), new NewMessage({}));

    console.log(
      `[telegram_user] User session started (@${me?.username || "unknown"}, id: ${this.selfId || "n/a"}, default_profile_hint=${this.selfProfileHint || "telegram_user"})`,
    );
  }

  async sendProactive(chatId, text) {
    if (!this.client) {
      throw new Error("telegram_user channel is not started");
    }
    await this._send(String(chatId), String(text || ""));
  }

  async stop() {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
      console.log("[telegram_user] Stopped");
    }
  }
}

module.exports = { TelegramUserChannel };
