
const TelegramBot = require("node-telegram-bot-api");
const { addMessage } = require("../db/database");

/**
 * Convert markdown-ish text to Telegram HTML format.
 */
function markdownToTelegramHTML(text) {
  if (!text) return "";

  // Extract code blocks first to protect them
  const codeBlocks = [];
  text = text.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(code);
    return `\x00CB${idx}\x00`;
  });

  // Extract inline code
  const inlineCodes = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(code);
    return `\x00IC${idx}\x00`;
  });

  // Remove heading markers
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "$1");

  // Remove blockquote markers
  text = text.replace(/^>\s*(.*)$/gm, "$1");

  // Escape HTML special chars
  text = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  text = text.replace(/__(.+?)__/g, "<b>$1</b>");

  // Italic (asterisk-only to avoid breaking snake_case like TELEGRAM_TOKEN)
  text = text.replace(/(^|[^\*])\*([^\*\n]+)\*(?!\*)/g, "$1<i>$2</i>");

  // Strikethrough
  text = text.replace(/~~(.+?)~~/g, "<s>$1</s>");

  // Bullet lists
  text = text.replace(/^[-*]\s+/gm, "• ");

  // Restore inline codes
  inlineCodes.forEach((code, i) => {
    const escaped = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    text = text.replace(`\x00IC${i}\x00`, `<code>${escaped}</code>`);
  });

  // Restore code blocks
  codeBlocks.forEach((code, i) => {
    const escaped = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    text = text.replace(`\x00CB${i}\x00`, `<pre><code>${escaped}</code></pre>`);
  });

  return text;
}

function htmlToPlainText(text) {
  if (!text) return "";

  return text
    .replace(/<\/?(b|strong|i|em|u|ins|s|strike|del|code|pre|a)(\s+[^>]*)?>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

class TelegramChannel {
  /**
   * @param {string} token - Telegram bot token
   * @param {import('../agent/loop').AgentLoop} agentLoop
   * @param {Set<string>} allowedIdentities
   */
  constructor(token, agentLoop, allowedIdentities = new Set()) {
    this.token = token;
    this.agentLoop = agentLoop;
    this.bot = null;
    this.pendingMessages = new Map();
    this.allowedIdentities = allowedIdentities;
    this.name = "telegram";
  }

  _hasToken(token) {
    return this.allowedIdentities.has(String(token));
  }

  _isUserAllowed(userId) {
    const uid = String(userId);
    return this._hasToken(`telegram:user:${uid}`);
  }

  _isChatAllowed(chatId) {
    const cid = String(chatId);
    return this._hasToken(`telegram:chat:${cid}`);
  }

  _isAllowed(chatId, userId) {
    if (!this.allowedIdentities || this.allowedIdentities.size === 0) {
      return true;
    }

    return this._isUserAllowed(userId) || this._isChatAllowed(chatId);
  }

  _isGroupChat(chatType) {
    return (
      chatType === "group" || chatType === "supergroup" || chatType === "channel"
    );
  }

  start() {
    this.bot = new TelegramBot(this.token, { polling: true });

    this.bot.on("message", (msg) => this._handleMessage(msg));

    this.bot.on("polling_error", (err) => {
      console.error("[telegram] Polling error:", err.message);
    });

    this.bot.on("error", (err) => {
      console.error("[telegram] Bot error:", err.message);
    });

    console.log("[telegram] Bot started (polling mode)");
  }

  _startTyping(chatId, messageThreadId = null) {
    let stopped = false;
    let timer = null;

    const tick = async () => {
      if (stopped) return;
      try {
        const opts = {};
        if (messageThreadId) {
          opts.message_thread_id = messageThreadId;
        }
        await this.bot.sendChatAction(chatId, "typing", opts);
      } catch (err) {
        console.warn("[telegram] Failed to send typing action:", err.message);
      }

      if (!stopped) {
        timer = setTimeout(tick, 4000);
      }
    };

    tick();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }

  async _handleMessage(msg) {
    if (!msg || !msg.from) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || "";
    const text = msg.text || msg.caption || "";
    const chatType = msg.chat.type || "";
    const messageThreadId = msg.message_thread_id || null;

    if (!text) return;

    const sessionKey = `telegram:${chatId}`;
    const channel = "telegram";
    const chatIdStr = String(chatId);

    if (!this._isAllowed(chatId, userId)) {
      console.warn(
        `[telegram] Rejected message from user ${userId} in chat ${chatId}: not in ALLOWED_IDENTITIES`,
      );
      const deniedText = "⛔ Access denied. This chat or user is not allowed.";

      await addMessage(sessionKey, "user", text);
      await addMessage(sessionKey, "assistant", deniedText);

      await this._sendMessage(chatId, deniedText, null, messageThreadId);

      if (this._isGroupChat(chatType) && !this._isChatAllowed(chatId)) {
        try {
          await this.bot.leaveChat(chatId);
          console.warn(`[telegram] Left unauthorized chat ${chatId}`);
        } catch (leaveErr) {
          console.error(
            `[telegram] Failed to leave unauthorized chat ${chatId}:`,
            leaveErr.message,
          );
        }
      }

      return;
    }

    console.log(
      `[telegram] Message from ${userId}${username ? "@" + username : ""}: ${text.slice(0, 80)}`,
    );

    // Handle /reset command specially (needs session key)
    if (text.trim() === "/reset") {
      await this.agentLoop.resetSession(sessionKey);
      await this._sendMessage(
        chatId,
        "🔄 Conversation history cleared!",
        null,
        messageThreadId,
      );
      return;
    }

    const stopTyping = this._startTyping(chatId, messageThreadId);

    try {
      const response = await this.agentLoop.processMessage(
        sessionKey,
        text,
        channel,
        chatIdStr,
      );

      const htmlContent = markdownToTelegramHTML(response);
      await this._sendMessage(chatId, htmlContent, "HTML", messageThreadId);
    } catch (err) {
      console.error("[telegram] Error processing message:", err);
      const errMsg = `❌ Error: ${err.message}`;
      await this._sendMessage(chatId, errMsg, null, messageThreadId);
    } finally {
      stopTyping();
    }
  }

  async _sendMessage(chatId, text, parseMode = null, messageThreadId = null) {
    const MAX_LENGTH = 4096;

    // Split long messages
    const chunks = [];
    for (let i = 0; i < text.length; i += MAX_LENGTH) {
      chunks.push(text.slice(i, i + MAX_LENGTH));
    }

    for (const chunk of chunks) {
      try {
        const opts = {};
        if (parseMode) opts.parse_mode = parseMode;
        if (messageThreadId) opts.message_thread_id = messageThreadId;
        await this.bot.sendMessage(chatId, chunk, opts);
      } catch (err) {
        // If HTML parse fails, send readable plain text without raw tags
        if (parseMode === "HTML") {
          try {
            const fallbackOpts = {};
            if (messageThreadId) fallbackOpts.message_thread_id = messageThreadId;
            await this.bot.sendMessage(chatId, htmlToPlainText(chunk), fallbackOpts);
          } catch (e2) {
            console.error("[telegram] Failed to send message:", e2.message);
          }
        } else {
          console.error("[telegram] Failed to send message:", err.message);
        }
      }
    }
  }

  stop() {
    if (this.bot) {
      this.bot.stopPolling();
      console.log("[telegram] Bot stopped");
    }
  }
}

module.exports = { TelegramChannel };
