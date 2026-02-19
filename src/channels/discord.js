const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
} = require("discord.js");
const { addMessage } = require("../db/database");

class DiscordChannel {
  constructor(token, agentLoop, allowedIdentities = new Set()) {
    this.token = token;
    this.agentLoop = agentLoop;
    this.allowedIdentities = allowedIdentities;
    this.client = null;
    this.name = "discord";
    this.requireMentionInGuild =
      process.env.DISCORD_REQUIRE_MENTION !== "false";
    this.streamingEnabled = process.env.STREAMING_RESPONSES === "true";
  }

  _hasToken(token) {
    return this.allowedIdentities.has(String(token));
  }

  _isAllowed(msg) {
    if (!this.allowedIdentities || this.allowedIdentities.size === 0) {
      return true;
    }

    const userId = String(msg.author.id);
    const channelId = String(msg.channelId);
    const guildId = msg.guildId ? String(msg.guildId) : "";

    return (
      this._hasToken(`discord:user:${userId}`) ||
      this._hasToken(`discord:channel:${channelId}`) ||
      (guildId && this._hasToken(`discord:guild:${guildId}`))
    );
  }

  _extractText(msg) {
    const raw = (msg.content || "").trim();
    if (!raw) return "";

    const isDM = msg.channel?.type === ChannelType.DM;
    if (!isDM && this.requireMentionInGuild) {
      const me = this.client?.user;
      if (!me) return "";
      const mentionPattern = new RegExp(`<@!?${me.id}>`, "g");
      if (!mentionPattern.test(raw)) {
        return "";
      }
      return raw.replace(mentionPattern, "").trim();
    }

    return raw;
  }

  async start() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    });

    this.client.on("ready", () => {
      const tag = this.client.user ? this.client.user.tag : "unknown";
      console.log(`[discord] Bot started as ${tag}`);
    });

    this.client.on("error", (err) => {
      console.error("[discord] Client error:", err.message);
    });

    this.client.on("messageCreate", (msg) => {
      this._handleMessage(msg).catch((err) => {
        console.error("[discord] Error processing message:", err.message);
      });
    });

    await this.client.login(this.token);
  }

  async _handleMessage(msg) {
    if (!msg || !msg.author || msg.author.bot) return;

    const text = this._extractText(msg);
    if (!text) return;

    const sessionKey = `discord:${msg.channelId}`;
    const channelId = String(msg.channelId);
    const userId = String(msg.author.id);

    if (!this._isAllowed(msg)) {
      const deniedText = "⛔ Access denied. This user/channel/guild is not allowed.";
      await addMessage(sessionKey, "user", text);
      await addMessage(sessionKey, "assistant", deniedText);
      await msg.reply(deniedText);
      return;
    }

    if (text === "/reset") {
      await this.agentLoop.resetSession(sessionKey);
      await msg.reply("🔄 Conversation history cleared!");
      return;
    }

    console.log(`[discord] Message from ${userId} in ${channelId}: ${text.slice(0, 80)}`);

    try {
      await msg.channel.sendTyping();
    } catch {}

    if (this.streamingEnabled) {
      const streamMsg = await msg.reply("⏳ Thinking...");
      const response = await this.agentLoop.processMessage(
        sessionKey,
        text,
        "discord",
        channelId,
        {
          onUpdate: async ({ text: partialText }) => {
            await this._updateStreamMessage(streamMsg, partialText);
          },
        },
      );
      await this._finalizeStreamMessage(streamMsg, response);
      return;
    }

    const response = await this.agentLoop.processMessage(
      sessionKey,
      text,
      "discord",
      channelId,
    );

    await this._sendMessage(msg, response);
  }

  async _updateStreamMessage(streamMsg, text) {
    const safeText = String(text || "").trim();
    if (!safeText) return;
    const chunk = safeText.slice(0, 1900);
    try {
      await streamMsg.edit(chunk);
    } catch {}
  }

  async _finalizeStreamMessage(streamMsg, text) {
    const safeText = String(text || "").trim() || "(empty response)";
    if (safeText.length <= 1900) {
      try {
        await streamMsg.edit(safeText);
        return;
      } catch {}
    }

    try {
      await streamMsg.delete();
    } catch {}

    await this._sendMessage({ reply: (chunk) => streamMsg.channel.send(chunk) }, safeText);
  }

  async _sendMessage(msg, text) {
    const MAX_LENGTH = 1900;
    const chunks = [];

    for (let i = 0; i < text.length; i += MAX_LENGTH) {
      chunks.push(text.slice(i, i + MAX_LENGTH));
    }

    for (const chunk of chunks) {
      await msg.reply(chunk || "(empty response)");
    }
  }

  async sendProactive(chatId, text) {
    if (!this.client) throw new Error("Discord client is not started");
    const channel = await this.client.channels.fetch(String(chatId));
    if (!channel || typeof channel.send !== "function") {
      throw new Error(`Discord channel not found: ${chatId}`);
    }

    const safeText = String(text || "").trim() || "(empty response)";
    for (let i = 0; i < safeText.length; i += 1900) {
      await channel.send(safeText.slice(i, i + 1900));
    }
  }

  async stop() {
    if (this.client) {
      await this.client.destroy();
      this.client = null;
      console.log("[discord] Bot stopped");
    }
  }
}

module.exports = { DiscordChannel };
