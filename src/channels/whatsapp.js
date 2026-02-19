const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { addMessage } = require("../db/database");

class WhatsAppChannel {
  constructor(agentLoop, allowedIdentities = new Set()) {
    this.agentLoop = agentLoop;
    this.allowedIdentities = allowedIdentities;
    this.client = null;
    this.name = "whatsapp";
    this.requirePrefix = process.env.WHATSAPP_REQUIRE_PREFIX || "";
    this.clientId = process.env.WHATSAPP_CLIENT_ID || "purrclaw";
  }

  _hasToken(token) {
    return this.allowedIdentities.has(String(token));
  }

  _isAllowed(message) {
    if (!this.allowedIdentities || this.allowedIdentities.size === 0) {
      return true;
    }

    const contactId = String(message.from || "");
    const chatId = String(message.from || "");

    return (
      (contactId && this._hasToken(`whatsapp:contact:${contactId}`)) ||
      (chatId && this._hasToken(`whatsapp:chat:${chatId}`))
    );
  }

  _extractText(message) {
    const raw = (message.body || "").trim();
    if (!raw) return "";

    if (!this.requirePrefix) {
      return raw;
    }

    if (!raw.startsWith(this.requirePrefix)) {
      return "";
    }

    return raw.slice(this.requirePrefix.length).trim();
  }

  async start() {
    this.client = new Client({
      authStrategy: new LocalAuth({ clientId: this.clientId }),
      puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    });

    this.client.on("qr", (qr) => {
      console.log("[whatsapp] Scan this QR code to authenticate:");
      qrcode.generate(qr, { small: true });
    });

    this.client.on("ready", () => {
      console.log("[whatsapp] Client ready");
    });

    this.client.on("auth_failure", (msg) => {
      console.error("[whatsapp] Auth failure:", msg);
    });

    this.client.on("disconnected", (reason) => {
      console.warn("[whatsapp] Disconnected:", reason);
    });

    this.client.on("message", (message) => {
      this._handleMessage(message).catch((err) => {
        console.error("[whatsapp] Error processing message:", err.message);
      });
    });

    await this.client.initialize();
  }

  async _handleMessage(message) {
    if (!message || message.fromMe) return;

    const text = this._extractText(message);
    if (!text) return;

    const chatId = String(message.from || "");
    const sessionKey = `whatsapp:${chatId}`;

    if (!this._isAllowed(message)) {
      const deniedText = "⛔ Access denied. This contact/chat is not allowed.";
      await addMessage(sessionKey, "user", text);
      await addMessage(sessionKey, "assistant", deniedText);
      await message.reply(deniedText);
      return;
    }

    if (text === "/reset") {
      await this.agentLoop.resetSession(sessionKey);
      await message.reply("🔄 Conversation history cleared!");
      return;
    }

    console.log(`[whatsapp] Message in ${chatId}: ${text.slice(0, 80)}`);

    try {
      const chat = await message.getChat();
      await chat.sendStateTyping();
    } catch {}

    const response = await this.agentLoop.processMessage(
      sessionKey,
      text,
      "whatsapp",
      chatId,
    );

    await this._sendMessage(message, response);
  }

  async _sendMessage(message, text) {
    const MAX_LENGTH = 3500;

    for (let i = 0; i < text.length; i += MAX_LENGTH) {
      const chunk = text.slice(i, i + MAX_LENGTH) || "(empty response)";
      await message.reply(chunk);
    }
  }

  async stop() {
    if (this.client) {
      await this.client.destroy();
      this.client = null;
      console.log("[whatsapp] Client stopped");
    }
  }

  async sendProactive(chatId, text) {
    if (!this.client) throw new Error("WhatsApp client is not started");
    await this.client.sendMessage(String(chatId), String(text || ""));
  }
}

module.exports = { WhatsAppChannel };
