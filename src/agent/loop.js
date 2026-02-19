
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
const {
  memoryReadTool,
  memoryWriteTool,
  memoryListTool,
  memoryDeleteTool,
} = require("../tools/memory");
const { webSearchTool } = require("../tools/web");
const { readUrlTool } = require("../tools/fetch");
const { workspaceSearchTool } = require("../tools/workspace_search");
const {
  reminderCreateTool,
  reminderListTool,
  reminderDeleteTool,
} = require("../tools/reminder");
const {
  spawnSubagentTool,
  subagentStatusTool,
  subagentResultTool,
  subagentListTool,
} = require("../tools/subagent");

const MAX_ITERATIONS = parseInt(process.env.MAX_ITERATIONS || "20", 10);
const CONTEXT_WINDOW = parseInt(process.env.CONTEXT_WINDOW || "65536", 10);
const SUMMARY_MSG_THRESHOLD = 20;

class AgentLoop {
  /**
   * @param {import('../providers/deepseek').DeepSeekProvider} provider
   * @param {string} workspace
   */
  constructor(provider, workspace, options = {}) {
    this.provider = provider;
    this.workspace = workspace;
    this.reminderService = options.reminderService || null;
    this.subagentService = options.subagentService || null;
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
    this.tools.register(memoryListTool());
    this.tools.register(memoryDeleteTool());
    this.tools.register(webSearchTool());
    this.tools.register(readUrlTool());
    this.tools.register(workspaceSearchTool(workspace, true));
    this.tools.register(reminderCreateTool(this.reminderService));
    this.tools.register(reminderListTool(this.reminderService));
    this.tools.register(reminderDeleteTool(this.reminderService));
    this.tools.register(spawnSubagentTool(this.subagentService));
    this.tools.register(subagentStatusTool(this.subagentService));
    this.tools.register(subagentResultTool(this.subagentService));
    this.tools.register(subagentListTool(this.subagentService));

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
  async processMessage(
    sessionKey,
    userMessage,
    channel = "",
    chatId = "",
    options = {},
  ) {
    // Handle slash commands
    const cmdResponse = await this._handleCommand(userMessage, channel, sessionKey);
    if (cmdResponse !== null) return cmdResponse;

    // Load history and summary
    const history = await getSessionHistory(sessionKey);
    const summary = await getSessionSummary(sessionKey);

    // Build messages array
    const messages = this.contextBuilder.buildMessages(
      history,
      summary,
      userMessage,
      channel,
      chatId,
    );

    // Save user message
    await addMessage(sessionKey, "user", userMessage);

    // Run LLM iteration loop
    const finalContent = await this._runLLMLoop(sessionKey, messages, {
      ...options,
      channel,
      chatId,
    });

    // Save assistant response
    await addMessage(sessionKey, "assistant", finalContent);

    // Maybe summarize in background
    this._maybeSummarize(sessionKey, channel, chatId).catch((err) =>
      console.error("[agent] Summarization trigger error:", err),
    );

    return (
      finalContent || "I've completed processing but have no response to give."
    );
  }

  /**
   * Core LLM iteration loop with tool calling.
   */
  async _runLLMLoop(sessionKey, messages, options = {}) {
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
          await this._forceCompression(sessionKey, messages);
          // Rebuild messages after compression
          const history = await getSessionHistory(sessionKey);
          const summary = await getSessionSummary(sessionKey);
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
        await this._emitPartial(options, finalContent, true);
        break;
      }

      if (response.content) {
        await this._emitPartial(options, response.content, false);
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
      await addMessage(
        sessionKey,
        "assistant",
        response.content || "",
        assistantMsg.tool_calls,
      );

      // Execute tool calls in parallel, preserve model order when appending messages.
      const executed = await Promise.all(
        response.tool_calls.map(async (tc) => {
          console.log(
            `[agent] Tool call: ${tc.name}(${JSON.stringify(tc.arguments).slice(0, 100)})`,
          );
          const result = await this.tools.execute(tc.name, tc.arguments, {
            sessionKey,
            channel: options.channel || "",
            chatId: options.chatId || "",
            toolTimeoutMs: Number(process.env.TOOL_TIMEOUT_MS || 45000),
            canSpawnSubagents: options.canSpawnSubagents !== false,
          });
          return { tc, result };
        }),
      );

      for (const { tc, result } of executed) {
        const toolResultMsg = {
          role: "tool",
          content: result.forLLM || (result.isError ? "Error" : ""),
          tool_call_id: tc.id,
        };
        messages.push(toolResultMsg);
        await addMessage(sessionKey, "tool", toolResultMsg.content, null, tc.id);
      }
    }

    return finalContent;
  }

  /**
   * Handle slash commands. Returns response string or null if not a command.
   */
  async _handleCommand(content, channel, sessionKey) {
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
      case "/subagents":
        return this._renderSubagents(sessionKey);
      case "/subagent":
        if (parts.length < 2) {
          return "Usage: /subagent <id>";
        }
        return this._renderSubagent(sessionKey, parts[1]);
      default:
        return null;
    }
  }

  _renderSubagents(sessionKey) {
    if (!this.subagentService) return "Subagent service is not configured.";
    const items = this.subagentService.listBySession(sessionKey);
    if (!items.length) return "No subagents for this session.";
    return (
      "🤝 Subagents:\n" +
      items
        .slice(0, 20)
        .map((item) => `• ${item.id} | ${item.status} | ${item.task.slice(0, 60)}`)
        .join("\n")
    );
  }

  _renderSubagent(sessionKey, id) {
    if (!this.subagentService) return "Subagent service is not configured.";
    const item = this.subagentService.get(id);
    if (!item || item.parentSessionKey !== sessionKey) {
      return `Subagent not found: ${id}`;
    }

    if (item.status === "completed") {
      return (
        `🤝 Subagent ${item.id}\n` +
        `Status: ${item.status}\n\n` +
        `${item.result || "(empty result)"}`
      );
    }

    if (item.status === "failed") {
      return (
        `🤝 Subagent ${item.id}\n` +
        `Status: ${item.status}\n` +
        `Error: ${item.error || "Unknown error"}`
      );
    }

    return `🤝 Subagent ${item.id}\nStatus: ${item.status}`;
  }

  /**
   * Reset session history (called externally for /reset command).
   */
  async resetSession(sessionKey) {
    await setHistory(sessionKey, []);
    await setSessionSummary(sessionKey, "");
  }

  /**
   * Trigger summarization if history is too long.
   */
  async _maybeSummarize(sessionKey, channel, chatId) {
    const history = await getSessionHistory(sessionKey);
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
    const history = await getSessionHistory(sessionKey);
    const existingSummary = await getSessionSummary(sessionKey);

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
        await setSessionSummary(sessionKey, response.content);
        await truncateHistory(sessionKey, 4);
        console.log(`[agent] Session ${sessionKey} summarized.`);
      }
    } catch (err) {
      console.error("[agent] Failed to summarize:", err.message);
    }
  }

  /**
   * Emergency context compression: drop oldest half of messages.
   */
  async _forceCompression(sessionKey, messages) {
    const history = await getSessionHistory(sessionKey);
    if (history.length <= 4) return;

    const mid = Math.floor(history.length / 2);
    const kept = history.slice(mid);
    await setHistory(sessionKey, kept);
    console.warn(`[agent] Force compression: dropped ${mid} messages.`);
  }

  async _emitPartial(options, text, isFinal) {
    const onUpdate = options && options.onUpdate;
    if (typeof onUpdate !== "function") return;
    try {
      await onUpdate({ text: text || "", isFinal: !!isFinal });
    } catch (err) {
      console.warn("[agent] onUpdate callback failed:", err.message);
    }
  }
}

module.exports = { AgentLoop };
