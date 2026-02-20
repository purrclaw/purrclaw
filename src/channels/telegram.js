const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { pipeline } = require("stream/promises");
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
   * @param {{ profileHint?: string }} options
   */
  constructor(
    token,
    agentLoop,
    allowedIdentities = new Set(),
    options = {},
  ) {
    this.token = token;
    this.agentLoop = agentLoop;
    this.bot = null;
    this.pendingMessages = new Map();
    this.allowedIdentities = allowedIdentities;
    this.name = "telegram";
    this.streamingEnabled = process.env.STREAMING_RESPONSES === "true";
    this.workspaceDir = path.resolve(
      this.agentLoop?.workspace || process.env.WORKSPACE_DIR || "./workspace",
    );
    this.profileHint = String(options.profileHint || "").trim();
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
    fs.mkdirSync(this.workspaceDir, { recursive: true });
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

  _sanitizeFilename(name, fallback = "file") {
    const base = path.basename(String(name || "").trim()) || fallback;
    const sanitized = base
      .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "_")
      .replace(/\s+/g, "_")
      .replace(/^_+|_+$/g, "");
    return sanitized || fallback;
  }

  _buildUniqueWorkspacePath(filename) {
    const parsed = path.parse(filename);
    const baseName = parsed.name || "file";
    const ext = parsed.ext || "";

    let nextPath = path.join(this.workspaceDir, `${baseName}${ext}`);
    let index = 0;
    while (fs.existsSync(nextPath)) {
      index += 1;
      nextPath = path.join(this.workspaceDir, `${baseName}_${index}${ext}`);
    }
    return nextPath;
  }

  _collectIncomingFiles(msg) {
    const files = [];
    const stamp = Date.now();

    if (msg.document?.file_id) {
      files.push({
        kind: "document",
        fileId: msg.document.file_id,
        filename:
          msg.document.file_name ||
          `document_${msg.document.file_unique_id || stamp}`,
      });
    }

    if (Array.isArray(msg.photo) && msg.photo.length > 0) {
      const photo = msg.photo[msg.photo.length - 1];
      files.push({
        kind: "photo",
        fileId: photo.file_id,
        filename: `photo_${photo.file_unique_id || stamp}.jpg`,
      });
    }

    if (msg.video?.file_id) {
      files.push({
        kind: "video",
        fileId: msg.video.file_id,
        filename: msg.video.file_name || `video_${msg.video.file_unique_id || stamp}.mp4`,
      });
    }

    if (msg.audio?.file_id) {
      files.push({
        kind: "audio",
        fileId: msg.audio.file_id,
        filename: msg.audio.file_name || `audio_${msg.audio.file_unique_id || stamp}.mp3`,
      });
    }

    if (msg.voice?.file_id) {
      files.push({
        kind: "voice",
        fileId: msg.voice.file_id,
        filename: `voice_${msg.voice.file_unique_id || stamp}.ogg`,
      });
    }

    if (msg.animation?.file_id) {
      files.push({
        kind: "animation",
        fileId: msg.animation.file_id,
        filename:
          msg.animation.file_name ||
          `animation_${msg.animation.file_unique_id || stamp}.mp4`,
      });
    }

    if (msg.video_note?.file_id) {
      files.push({
        kind: "video_note",
        fileId: msg.video_note.file_id,
        filename: `video_note_${msg.video_note.file_unique_id || stamp}.mp4`,
      });
    }

    if (msg.sticker?.file_id) {
      const ext = msg.sticker.is_animated
        ? ".tgs"
        : msg.sticker.is_video
          ? ".webm"
          : ".webp";
      files.push({
        kind: "sticker",
        fileId: msg.sticker.file_id,
        filename: `sticker_${msg.sticker.file_unique_id || stamp}${ext}`,
      });
    }

    return files;
  }

  async _downloadFileById(item) {
    const fileMeta = await this.bot.getFile(item.fileId);
    const fileLink = await this.bot.getFileLink(item.fileId);

    const fromFilePath = this._sanitizeFilename(
      path.basename(String(fileMeta?.file_path || "")),
      "",
    );
    let filename = this._sanitizeFilename(
      item.filename || fromFilePath || `${item.kind}_${Date.now()}`,
    );

    if (!path.extname(filename)) {
      const extFromPath = path.extname(String(fileMeta?.file_path || ""));
      if (extFromPath) {
        filename = `${filename}${extFromPath}`;
      }
    }

    const targetPath = this._buildUniqueWorkspacePath(filename);
    const response = await axios({
      method: "GET",
      url: fileLink,
      responseType: "stream",
      timeout: 60000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    await pipeline(response.data, fs.createWriteStream(targetPath));

    return {
      kind: item.kind,
      absolutePath: targetPath,
      relativePath:
        path.relative(this.workspaceDir, targetPath) || path.basename(targetPath),
    };
  }

  async _saveIncomingFiles(fileItems) {
    if (!Array.isArray(fileItems) || fileItems.length === 0) {
      return { saved: [], failed: [] };
    }

    fs.mkdirSync(this.workspaceDir, { recursive: true });

    const saved = [];
    const failed = [];

    for (const item of fileItems) {
      try {
        const record = await this._downloadFileById(item);
        saved.push(record);
      } catch (err) {
        failed.push({
          kind: item.kind,
          error: err.message,
        });
      }
    }

    return { saved, failed };
  }

  _buildSavedFilesBlock(savedFiles) {
    if (!savedFiles.length) return "";
    return [
      "User uploaded files. Saved to workspace:",
      ...savedFiles.map((item) => `- ${item.relativePath}`),
    ].join("\n");
  }

  _buildFailedFilesBlock(failedFiles) {
    if (!failedFiles.length) return "";
    return [
      "Failed to save some uploaded files:",
      ...failedFiles.map((item) => `- ${item.kind}: ${item.error}`),
    ].join("\n");
  }

  async _handleMessage(msg) {
    if (!msg || !msg.from) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || "";
    const rawText = String(msg.text || msg.caption || "").trim();
    const chatType = msg.chat.type || "";
    const messageThreadId = msg.message_thread_id || null;
    const incomingFiles = this._collectIncomingFiles(msg);

    const sessionKey = `telegram:${chatId}`;
    const channel = "telegram";
    const chatIdStr = String(chatId);

    if (!rawText && incomingFiles.length === 0) return;

    if (!this._isAllowed(chatId, userId)) {
      console.warn(
        `[telegram] Rejected message from user ${userId} in chat ${chatId}: not in ALLOWED_IDENTITIES`,
      );
      const deniedText = "⛔ Access denied. This chat or user is not allowed.";
      const deniedInputText =
        rawText || `[${incomingFiles.length} uploaded file(s)]`;

      await addMessage(sessionKey, "user", deniedInputText);
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

    const { saved: savedFiles, failed: failedFiles } =
      await this._saveIncomingFiles(incomingFiles);

    if (failedFiles.length) {
      console.error(
        `[telegram] Failed to save ${failedFiles.length} file(s) in chat ${chatId}`,
      );
    }

    const savedFilesBlock = this._buildSavedFilesBlock(savedFiles);
    const failedFilesBlock = this._buildFailedFilesBlock(failedFiles);

    if (!rawText && (savedFiles.length > 0 || failedFiles.length > 0)) {
      const lines = [];
      if (savedFiles.length > 0) {
        lines.push(
          "✅ Files saved to workspace:",
          ...savedFiles.map((item) => `- ${item.relativePath}`),
        );
      }
      if (failedFiles.length > 0) {
        lines.push(
          "⚠️ Failed to save:",
          ...failedFiles.map((item) => `- ${item.kind}: ${item.error}`),
        );
      }
      await this._sendMessage(chatId, lines.join("\n"), null, messageThreadId);
      return;
    }

    let text = rawText;
    if (savedFilesBlock) {
      text = text ? `${text}\n\n${savedFilesBlock}` : savedFilesBlock;
    }
    if (failedFilesBlock) {
      text = text ? `${text}\n\n${failedFilesBlock}` : failedFilesBlock;
    }

    if (!text) return;

    console.log(
      `[telegram] Message from ${userId}${username ? "@" + username : ""}: ${text.slice(0, 80)}`,
    );

    // Handle /reset command specially (needs session key)
    if (rawText === "/reset") {
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
    const sendTelegramFile = async ({ path: filePath, caption = "" } = {}) => {
      await this._sendDocument(chatId, filePath, caption, messageThreadId);
    };

    try {
      if (this.streamingEnabled) {
        const stream = await this._startStreamMessage(chatId, messageThreadId);
        const response = await this.agentLoop.processMessage(
          sessionKey,
          text,
          channel,
          chatIdStr,
          {
            sendTelegramFile,
            profileHint: this.profileHint,
            onUpdate: async ({ text: partialText }) => {
              await this._updateStreamMessage(stream, partialText);
            },
          },
        );
        await this._finalizeStreamMessage(stream, response);
        return;
      }

      const response = await this.agentLoop.processMessage(
        sessionKey,
        text,
        channel,
        chatIdStr,
        {
          sendTelegramFile,
          profileHint: this.profileHint,
        },
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

  async _startStreamMessage(chatId, messageThreadId = null) {
    const opts = {};
    if (messageThreadId) opts.message_thread_id = messageThreadId;
    const sent = await this.bot.sendMessage(chatId, "⏳ Thinking...", opts);
    return {
      chatId,
      messageThreadId,
      messageId: sent.message_id,
      updatedAt: 0,
      lastText: "",
    };
  }

  async _updateStreamMessage(stream, text) {
    const now = Date.now();
    if (now - stream.updatedAt < 900) return;
    const safeText = String(text || "").trim();
    if (!safeText || safeText === stream.lastText) return;
    if (safeText.length > 3900) return;

    const html = markdownToTelegramHTML(safeText);
    const opts = {
      chat_id: stream.chatId,
      message_id: stream.messageId,
      parse_mode: "HTML",
    };
    if (stream.messageThreadId) {
      opts.message_thread_id = stream.messageThreadId;
    }

    try {
      await this.bot.editMessageText(html, opts);
      stream.updatedAt = now;
      stream.lastText = safeText;
    } catch {}
  }

  async _finalizeStreamMessage(stream, finalText) {
    const safeText = String(finalText || "").trim() || "(empty response)";
    if (safeText.length <= 3900) {
      const html = markdownToTelegramHTML(safeText);
      const opts = {
        chat_id: stream.chatId,
        message_id: stream.messageId,
        parse_mode: "HTML",
      };
      if (stream.messageThreadId) {
        opts.message_thread_id = stream.messageThreadId;
      }

      try {
        await this.bot.editMessageText(html, opts);
        return;
      } catch {}
    }

    try {
      await this.bot.deleteMessage(stream.chatId, stream.messageId);
    } catch {}
    await this._sendMessage(
      stream.chatId,
      markdownToTelegramHTML(safeText),
      "HTML",
      stream.messageThreadId,
    );
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

  async _sendDocument(chatId, filePath, caption = "", messageThreadId = null) {
    const opts = {};
    if (caption) opts.caption = String(caption).slice(0, 1024);
    if (messageThreadId) opts.message_thread_id = messageThreadId;
    await this.bot.sendDocument(chatId, filePath, opts);
  }

  async sendProactive(chatId, text, meta = {}) {
    const messageThreadId = meta.messageThreadId || null;
    const htmlContent = markdownToTelegramHTML(String(text || ""));
    await this._sendMessage(chatId, htmlContent, "HTML", messageThreadId);
  }

  stop() {
    if (this.bot) {
      this.bot.stopPolling();
      console.log("[telegram] Bot stopped");
    }
  }
}

module.exports = { TelegramChannel };
