const { App } = require("@slack/bolt");
const { addMessage } = require("../db/database");

class SlackChannel {
  constructor(config, agentLoop, allowedIdentities = new Set()) {
    this.config = config;
    this.agentLoop = agentLoop;
    this.allowedIdentities = allowedIdentities;
    this.app = null;
    this.botUserId = null;
    this.name = "slack";
    this.requireMentionInChannel =
      process.env.SLACK_REQUIRE_MENTION !== "false";
    this.streamingEnabled = process.env.STREAMING_RESPONSES === "true";
  }

  _hasToken(token) {
    return this.allowedIdentities.has(String(token));
  }

  _isAllowed(event) {
    if (!this.allowedIdentities || this.allowedIdentities.size === 0) {
      return true;
    }

    const userId = String(event.user || "");
    const channelId = String(event.channel || "");
    const teamId = String(event.team || "");

    return (
      (userId && this._hasToken(`slack:user:${userId}`)) ||
      (channelId && this._hasToken(`slack:channel:${channelId}`)) ||
      (teamId && this._hasToken(`slack:team:${teamId}`))
    );
  }

  _extractText(event) {
    const raw = (event.text || "").trim();
    if (!raw) return "";

    const isDirect = String(event.channel_type || "") === "im";
    if (!isDirect && this.requireMentionInChannel) {
      if (!this.botUserId) return "";
      const mention = `<@${this.botUserId}>`;
      if (!raw.includes(mention)) {
        return "";
      }
      return raw.replaceAll(mention, "").trim();
    }

    return raw;
  }

  async start() {
    this.app = new App({
      token: this.config.botToken,
      appToken: this.config.appToken,
      socketMode: true,
      signingSecret: this.config.signingSecret || undefined,
    });

    this.app.error((err) => {
      console.error("[slack] App error:", err.message);
    });

    this.app.event("message", async ({ event, say, client }) => {
      if (!event || event.subtype || !event.user || event.bot_id) return;
      await this._handleMessage(event, say, client);
    });

    await this.app.start();

    const auth = await this.app.client.auth.test({
      token: this.config.botToken,
    });
    this.botUserId = auth.user_id || null;

    console.log(`[slack] Bot started (${auth.user || "unknown"})`);
  }

  async _handleMessage(event, say, client) {
    const text = this._extractText(event);
    if (!text) return;

    const sessionKey = `slack:${event.channel}`;
    const channelId = String(event.channel || "");
    const userId = String(event.user || "");

    if (!this._isAllowed(event)) {
      const deniedText = "⛔ Access denied. This user/channel/team is not allowed.";
      await addMessage(sessionKey, "user", text);
      await addMessage(sessionKey, "assistant", deniedText);
      await say({ text: deniedText, thread_ts: event.thread_ts || event.ts });
      return;
    }

    if (text === "/reset") {
      await this.agentLoop.resetSession(sessionKey);
      await say({
        text: "🔄 Conversation history cleared!",
        thread_ts: event.thread_ts || event.ts,
      });
      return;
    }

    console.log(`[slack] Message from ${userId} in ${channelId}: ${text.slice(0, 80)}`);

    try {
      await client.reactions.add({
        channel: event.channel,
        name: "eyes",
        timestamp: event.ts,
      });
    } catch {}

    const threadTs = event.thread_ts || event.ts;

    if (this.streamingEnabled) {
      const stream = await this._startStreamMessage(client, event.channel, threadTs);
      const response = await this.agentLoop.processMessage(
        sessionKey,
        text,
        "slack",
        channelId,
        {
          onUpdate: async ({ text: partialText }) => {
            await this._updateStreamMessage(client, stream, partialText);
          },
        },
      );
      await this._finalizeStreamMessage(client, stream, response);
      return;
    }

    const response = await this.agentLoop.processMessage(
      sessionKey,
      text,
      "slack",
      channelId,
    );

    await this._sendMessage(say, response, threadTs);
  }

  async _sendMessage(say, text, threadTs) {
    const MAX_LENGTH = 3000;

    for (let i = 0; i < text.length; i += MAX_LENGTH) {
      const chunk = text.slice(i, i + MAX_LENGTH) || "(empty response)";
      await say({ text: chunk, thread_ts: threadTs });
    }
  }

  async _startStreamMessage(client, channel, threadTs) {
    const posted = await client.chat.postMessage({
      channel,
      text: "⏳ Thinking...",
      thread_ts: threadTs,
    });
    return {
      channel,
      threadTs,
      ts: posted.ts,
      updatedAt: 0,
      lastText: "",
    };
  }

  async _updateStreamMessage(client, stream, text) {
    const now = Date.now();
    if (now - stream.updatedAt < 900) return;
    const safeText = String(text || "").trim();
    if (!safeText || safeText === stream.lastText) return;

    try {
      await client.chat.update({
        channel: stream.channel,
        ts: stream.ts,
        text: safeText.slice(0, 3000),
      });
      stream.updatedAt = now;
      stream.lastText = safeText;
    } catch {}
  }

  async _finalizeStreamMessage(client, stream, text) {
    const safeText = String(text || "").trim() || "(empty response)";
    if (safeText.length <= 3000) {
      try {
        await client.chat.update({
          channel: stream.channel,
          ts: stream.ts,
          text: safeText,
        });
        return;
      } catch {}
    }

    try {
      await client.chat.delete({
        channel: stream.channel,
        ts: stream.ts,
      });
    } catch {}

    for (let i = 0; i < safeText.length; i += 3000) {
      await client.chat.postMessage({
        channel: stream.channel,
        text: safeText.slice(i, i + 3000),
        thread_ts: stream.threadTs,
      });
    }
  }

  async stop() {
    if (this.app) {
      await this.app.stop();
      this.app = null;
      console.log("[slack] Bot stopped");
    }
  }
}

module.exports = { SlackChannel };
