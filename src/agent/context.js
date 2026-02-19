
const fs = require("fs");
const path = require("path");
const os = require("os");

class ContextBuilder {
  constructor(workspace, tools = null) {
    this.workspace = path.resolve(workspace);
    this.tools = tools;
  }

  setTools(tools) {
    this.tools = tools;
  }

  getIdentity() {
    const now = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "long",
    });

    const runtime = `${os.platform()} ${os.arch()}, Node.js ${process.version}`;
    const toolsSection = this.buildToolsSection();

    return `# PurrClaw 🐾

You are PurrClaw, a helpful AI assistant.

## Current Time
${now}

## Runtime
${runtime}

## Workspace
Your workspace is at: ${this.workspace}
- Memory: use memory_read / memory_write / memory_list / memory_delete tools
- Files: use read_file / write_file / list_dir tools

${toolsSection}

## Important Rules

1. **ALWAYS use tools** - When you need to perform an action (save notes, execute commands, read files, etc.), you MUST call the appropriate tool. Do NOT just say you'll do it or pretend to do it.

2. **Be helpful and accurate** - When using tools, briefly explain what you're doing.

3. **Memory** - Use memory_write to remember important things about the user. Use memory_read to recall them.

4. **Citations for web info** - If you use web_search or read_url, include source links in the final answer using [1], [2], ... notation.`;
  }

  buildToolsSection() {
    if (!this.tools) return "";
    const summaries = this.tools.getSummaries();
    if (!summaries.length) return "";

    return `## Available Tools

**CRITICAL**: You MUST use tools to perform actions. Do NOT pretend to execute commands or save data.

You have access to the following tools:

${summaries.join("\n")}`;
  }

  loadBootstrapFiles() {
    const files = ["AGENT.md", "SOUL.md", "USER.md", "IDENTITY.md"];
    let result = "";
    for (const filename of files) {
      const filePath = path.join(this.workspace, filename);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf8");
        result += `## ${filename}\n\n${content}\n\n`;
      }
    }
    return result;
  }

  buildSystemPrompt(channel = "", chatId = "") {
    const parts = [this.getIdentity()];

    const bootstrap = this.loadBootstrapFiles();
    if (bootstrap) parts.push(bootstrap);

    if (channel && chatId) {
      parts.push(`## Current Session\nChannel: ${channel}\nChat ID: ${chatId}`);
    }

    return parts.join("\n\n---\n\n");
  }

  buildMessages(history, summary, currentMessage, channel = "", chatId = "") {
    let systemPrompt = this.buildSystemPrompt(channel, chatId);

    if (summary) {
      systemPrompt += `\n\n## Summary of Previous Conversation\n\n${summary}`;
    }

    // Remove orphaned tool messages at the start of history
    let cleanHistory = [...history];
    while (cleanHistory.length > 0 && cleanHistory[0].role === "tool") {
      cleanHistory.shift();
    }

    const messages = [
      { role: "system", content: systemPrompt },
      ...cleanHistory,
    ];

    if (currentMessage) {
      messages.push({ role: "user", content: currentMessage });
    }

    return messages;
  }
}

module.exports = { ContextBuilder };
