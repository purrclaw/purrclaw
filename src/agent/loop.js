"use strict";

const {
  getSessionHistory,
  getSessionSummary,
  addMessage,
  setSessionSummary,
  truncateHistory,
  setHistory,
} = require("../db/database");

const { ContextBuilder } = require("./context");
const { ToolRegistry } = require("../tools/registry");
const {
  readFileTool,
  writeFileTool,
  appendFileTool,
  listDirTool,
} = require("../tools/filesystem");
const { execTool } = require("../tools/shell");
const { memoryReadTool, memoryWriteTool } = require("../tools/memory");

const MAX_ITERATIONS = parseInt(process.env.MAX_ITERATIONS || "20", 10);
const CONTEXT_WINDOW = parseInt(process.env.CONTEXT_WINDOW || "65536", 10);
const SUMMARY_MSG_THRESHOLD = 20;

class AgentLoop {
  /**
   * @param {import('../providers/deepseek').DeepSeekProvider} provider
   * @param {string} workspace
   */
  constructor(provider, workspace) {
    this.provider = provider;
    this.workspace = workspace;
    this.summarizing = new Set();

    // Build tool registry
    this.tools = new ToolRegistry();
    this.tools.register(readFileTool(workspace, true));
    this.tools.register(writeFileTool(workspace, true));
    this.tools.register(appendFileTool(workspace, true));
    this.tools.register(listDirTool(workspace, true));
    this.tools.register(execTool(workspace));
    this.tools.register(memoryReadTool());
    this.tools.register(memoryWriteTool());

    // Context builder
    this.contextBuilder = new ContextBuilder(workspace, this.tools);
  }

  /**
   * Process a user message and return the assistant's response.
   * @param {string} sessionKey - Unique session identifier (e.g. "telegram:123456")
   * @param {string} userMessage - The user's message
   * @param {string} channel - Channel name (e.g. "telegram")
   * @param {string} chatId - Chat ID string
   * @returns {Promise<string>} - The assistant's final response
   */
  async processMessage(sessionKey, userMessage, channel = "", chatId = "") {
    // Handle slash commands
    const cmdResponse = this._handleCommand(userMessage, channel);
    if (cmdResponse !== null) return cmdResponse;

    // Load history and summary
    const history = getSessionHistory(sessionKey);
    const summary = getSessionSummary(sessionKey);

    // Build messages array
    const messages = this.contextBuilder.buildMessages(
      history,
      summary,
      userMessage,
      channel,
      chatId,
    );

    // Save user message
    addMessage(sessionKey, "user", userMessage);

    // Run LLM iteration loop
    const finalContent = await this._runLLMLoop(sessionKey, messages);

    // Save assistant response
    addMessage(sessionKey, "assistant", finalContent);

    // Maybe summarize in background
    this._maybeSummarize(sessionKey, channel, chatId);

    return (
      finalContent || "I've completed processing but have no response to give."
    );
  }

  /**
   * Core LLM iteration loop with tool calling.
   */
  async _runLLMLoop(sessionKey, messages) {
    const toolDefs = this.tools.toProviderDefs();
    let finalContent = "";

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      let response;
      try {
        response = await this.provider.chat(messages, toolDefs, null, {
          max_tokens: 8192,
          temperature: 0.7,
        });
      } catch (err) {
        // On context/token error, try compression
        const errMsg = err.message.toLowerCase();
        if (
          errMsg.includes("token") ||
          errMsg.includes("context") ||
          errMsg.includes("length")
        ) {
          console.warn(
            "[agent] Context window error, compressing...",
            err.message,
          );
          this._forceCompression(sessionKey, messages);
          // Rebuild messages after compression
          const history = getSessionHistory(sessionKey);
          const summary = getSessionSummary(sessionKey);
          messages = this.contextBuilder.buildMessages(
            history,
            summary,
            "",
            "",
            "",
          );
          continue;
        }
        throw err;
      }

      // No tool calls → final answer
      if (!response.tool_calls || response.tool_calls.length === 0) {
        finalContent = response.content;
        break;
      }

      // Build assistant message with tool calls
      const assistantMsg = {
        role: "assistant",
        content: response.content || "",
        tool_calls: response.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      };
      messages.push(assistantMsg);
      addMessage(
        sessionKey,
        "assistant",
        response.content || "",
        assistantMsg.tool_calls,
      );

      // Execute each tool call
      for (const tc of response.tool_calls) {
        console.log(
          `[agent] Tool call: ${tc.name}(${JSON.stringify(tc.arguments).slice(0, 100)})`,
        );

        const result = await this.tools.execute(tc.name, tc.arguments, {});

        const toolResultMsg = {
          role: "tool",
          content: result.forLLM || (result.isError ? "Error" : ""),
          tool_call_id: tc.id,
        };
        messages.push(toolResultMsg);
        addMessage(sessionKey, "tool", toolResultMsg.content, null, tc.id);
      }
    }

    return finalContent;
  }

  /**
   * Handle slash commands. Returns response string or null if not a command.
   */
  _handleCommand(content, channel) {
    const text = content.trim();
    if (!text.startsWith("/")) return null;

    const parts = text.split(/\s+/);
    const cmd = parts[0];

    switch (cmd) {
      case "/start":
        return "👋 Hello! I'm PurrClaw 🐾, your AI assistant powered by DeepSeek. How can I help you today?";
      case "/help":
        return (
          "🐾 *PurrClaw Help*\n\n" +
          "I'm an AI assistant that can help you with:\n" +
          "• Answering questions\n" +
          "• Reading and writing files\n" +
          "• Executing shell commands\n" +
          "• Remembering information\n\n" +
          "*Commands:*\n" +
          "/start - Start the bot\n" +
          "/help - Show this help\n" +
          "/reset - Clear conversation history\n" +
          "/model - Show current model\n" +
          "/tools - List available tools"
        );
      case "/model":
        return `🤖 Current model: ${this.provider.model}`;
      case "/tools":
        return `🔧 Available tools:\n${this.tools
          .list()
          .map((t) => `• ${t}`)
          .join("\n")}`;
      default:
        return null;
    }
  }

  /**
   * Reset session history (called externally for /reset command).
   */
  resetSession(sessionKey) {
    setHistory(sessionKey, []);
    setSessionSummary(sessionKey, "");
  }

  /**
   * Trigger summarization if history is too long.
   */
  _maybeSummarize(sessionKey, channel, chatId) {
    const history = getSessionHistory(sessionKey);
    const tokenEstimate =
      (history.reduce((sum, m) => sum + (m.content || "").length, 0) * 2) / 5;
    const threshold = CONTEXT_WINDOW * 0.75;

    if (history.length > SUMMARY_MSG_THRESHOLD || tokenEstimate > threshold) {
      if (this.summarizing.has(sessionKey)) return;
      this.summarizing.add(sessionKey);

      this._summarizeSession(sessionKey)
        .catch((err) => console.error("[agent] Summarization error:", err))
        .finally(() => this.summarizing.delete(sessionKey));
    }
  }

  async _summarizeSession(sessionKey) {
    const history = getSessionHistory(sessionKey);
    const existingSummary = getSessionSummary(sessionKey);

    if (history.length <= 4) return;

    const toSummarize = history
      .slice(0, history.length - 4)
      .filter((m) => m.role === "user" || m.role === "assistant");

    if (toSummarize.length === 0) return;

    const prompt =
      "Provide a concise summary of this conversation segment, preserving core context and key points.\n" +
      (existingSummary ? `Existing context: ${existingSummary}\n` : "") +
      "\nCONVERSATION:\n" +
      toSummarize.map((m) => `${m.role}: ${m.content}`).join("\n");

    try {
      const response = await this.provider.chat(
        [{ role: "user", content: prompt }],
        [],
        null,
        { max_tokens: 1024, temperature: 0.3 },
      );

      if (response.content) {
        setSessionSummary(sessionKey, response.content);
        truncateHistory(sessionKey, 4);
        console.log(`[agent] Session ${sessionKey} summarized.`);
      }
    } catch (err) {
      console.error("[agent] Failed to summarize:", err.message);
    }
  }

  /**
   * Emergency context compression: drop oldest half of messages.
   */
  _forceCompression(sessionKey, messages) {
    const history = getSessionHistory(sessionKey);
    if (history.length <= 4) return;

    const mid = Math.floor(history.length / 2);
    const kept = history.slice(mid);
    setHistory(sessionKey, kept);
    console.warn(`[agent] Force compression: dropped ${mid} messages.`);
  }
}

module.exports = { AgentLoop };
