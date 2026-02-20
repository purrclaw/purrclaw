
const fs = require("fs");
const path = require("path");
const os = require("os");

function normalizeProfileName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_@.-]/g, "_");
}

function parseDebugFlag(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return null;
  return !["0", "false", "off", "no"].includes(value);
}

function isProfileDebugEnabled(channel) {
  const globalFlag = parseDebugFlag(process.env.PROFILE_DEBUG_LOGS);
  const telegramFlag = parseDebugFlag(process.env.TELEGRAM_USER_PROFILE_DEBUG);
  if (channel === "telegram_user") {
    if (telegramFlag !== null) return telegramFlag;
    if (globalFlag !== null) return globalFlag;
    return false;
  }
  return globalFlag === true;
}

function isProfileDrivenContext(channel = "", profileHint = "") {
  const normalizedChannel = String(channel || "").trim().toLowerCase();
  const normalizedHint = normalizeProfileName(profileHint || "");
  return (
    normalizedChannel === "telegram_user" ||
    normalizedHint.startsWith("telegram_user_@")
  );
}

function extractIdentityName(identityMarkdown = "") {
  const text = String(identityMarkdown || "");
  if (!text.trim()) return "";

  const lines = text.split(/\r?\n/);
  let nameIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*##\s*Name\s*$/i.test(lines[i])) {
      nameIndex = i;
      break;
    }
  }

  if (nameIndex >= 0) {
    for (let i = nameIndex + 1; i < lines.length; i += 1) {
      const line = String(lines[i] || "").trim();
      if (!line) continue;
      if (/^\s*##\s+/.test(line)) break;
      if (line === "---" || line.startsWith("#")) continue;
      const value = line.replace(/^["'`]+|["'`]+$/g, "").trim();
      if (value) {
        return value;
      }
    }
  }

  const inlineMatch = text.match(/^\s*name\s*:\s*([^\n\r]+)/im);
  if (inlineMatch && inlineMatch[1]) {
    return inlineMatch[1].replace(/^["'`]+|["'`]+$/g, "").trim();
  }

  return "";
}

class ContextBuilder {
  constructor(workspace, tools = null) {
    this.workspace = path.resolve(workspace);
    this.tools = tools;
  }

  setTools(tools) {
    this.tools = tools;
  }

  getIdentity(channel = "", profileHint = "") {
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
    const profileDrivenIdentity = isProfileDrivenContext(channel, profileHint);
    const header = profileDrivenIdentity ? "# Telegram User Agent" : "# PurrClaw 🐾";
    const roleLine = profileDrivenIdentity
      ? "You are a personal Telegram auto-reply assistant acting on behalf of the account owner."
      : "You are PurrClaw, a helpful AI assistant.";
    const identityRule = profileDrivenIdentity
      ? "Identity source: use profile files below (`IDENTITY.md`, `SOUL.md`, `USER.md`) as the authority for naming and persona. Do not override them."
      : "";

    return `${header}

${roleLine}

${identityRule}

## Current Time
${now}

## Runtime
${runtime}

## Workspace
Your workspace is at: ${this.workspace}
- Memory: use memory_read / memory_write / memory_list / memory_delete tools
- Files: use read_file / write_file / append_file / list_dir tools
- Telegram files: use send_telegram_file to send workspace files back in Telegram chats

${toolsSection}

## Important Rules

1. **ALWAYS use tools** - When you need to perform an action (save notes, execute commands, read files, etc.), you MUST call the appropriate tool. Do NOT just say you'll do it or pretend to do it.

2. **Be helpful and accurate** - When using tools, briefly explain what you're doing.

3. **Memory** - Use memory_write to remember important things about the user. Use memory_read to recall them.

4. **Citations for web info** - If you use web_search or read_url, include source links in the final answer using [1], [2], ... notation.

5. **Secrets safety** - Never reveal secrets (passwords, tokens, API keys, session strings, or environment values).

6. **Filesystem lock** - Filesystem tools are restricted by a password policy. If access is denied, ask user to provide the password in the same message.`;
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

  _resolveBootstrapSources(channel = "", profileHint = "") {
    const files = [];
    const meta = [];
    const seen = new Set();
    const add = (dir, reason) => {
      const key = path.resolve(dir);
      if (seen.has(key)) return;
      seen.add(key);
      files.push(key);
      meta.push({
        dir: key,
        reason,
        exists: fs.existsSync(key),
      });
    };

    const profile = normalizeProfileName(process.env.WORKSPACE_PROFILE || "");
    if (profile) {
      add(path.join(this.workspace, "profiles", profile), `workspace_profile:${profile}`);
    }

    const hint = normalizeProfileName(profileHint || "");
    if (hint) {
      add(path.join(this.workspace, "profiles", hint), `profile_hint:${hint}`);
    }

    const normalizedChannel = String(channel || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_");
    if (normalizedChannel) {
      add(path.join(this.workspace, "profiles", normalizedChannel), `channel:${normalizedChannel}`);
    }

    add(path.join(this.workspace, "profiles", "default"), "profiles_default");
    add(this.workspace, "workspace_root");

    return {
      existing: files.filter((dir) => fs.existsSync(dir)),
      meta,
    };
  }

  loadBootstrapFiles(channel = "", profileHint = "") {
    const files = ["AGENT.md", "RULES.md", "SOUL.md", "USER.md", "IDENTITY.md"];
    let result = "";
    const debug = isProfileDebugEnabled(channel);

    const pending = new Set(files);
    const sourceInfo = this._resolveBootstrapSources(channel, profileHint);
    const sources = sourceInfo.existing;

    if (debug) {
      const workspaceProfile = normalizeProfileName(process.env.WORKSPACE_PROFILE || "") || "-";
      console.log(
        `[context] profile debug: channel=${channel || "-"} profile_hint=${normalizeProfileName(profileHint || "") || "-"} workspace_profile=${workspaceProfile}`,
      );
      for (const item of sourceInfo.meta) {
        console.log(
          `[context] source ${item.exists ? "hit " : "miss"} ${item.reason} -> ${item.dir}`,
        );
      }
    }

    for (const dir of sources) {
      for (const filename of files) {
        if (!pending.has(filename)) continue;

        const filePath = path.join(dir, filename);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf8");
          result += `## ${filename}\n\n${content}\n\n`;
          pending.delete(filename);
          if (debug) {
            console.log(`[context] loaded ${filename} from ${filePath}`);
          }
        }
      }
    }

    if (debug) {
      for (const filename of files) {
        if (pending.has(filename)) {
          console.log(`[context] missing ${filename}`);
        }
      }
      console.log(`[context] bootstrap length=${result.length}`);
    }

    return result;
  }

  resolveIdentityName(channel = "", profileHint = "") {
    const sourceInfo = this._resolveBootstrapSources(channel, profileHint);
    for (const dir of sourceInfo.existing) {
      const filePath = path.join(dir, "IDENTITY.md");
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, "utf8");
      const name = extractIdentityName(content);
      if (name) {
        if (isProfileDebugEnabled(channel)) {
          console.log(`[context] identity_name=${name} from ${filePath}`);
        }
        return name;
      }
    }
    return "";
  }

  buildSystemPrompt(channel = "", chatId = "", profileHint = "") {
    const parts = [this.getIdentity(channel, profileHint)];

    const bootstrap = this.loadBootstrapFiles(channel, profileHint);
    if (bootstrap) parts.push(bootstrap);

    if (isProfileDrivenContext(channel, profileHint)) {
      const identityName = this.resolveIdentityName(channel, profileHint);
      if (identityName) {
        parts.push(
          `## Identity Lock\nUse this display name in conversation: ${identityName}\nIf asked your name, answer with exactly this name.`,
        );
      }
    }

    if (channel && chatId) {
      parts.push(`## Current Session\nChannel: ${channel}\nChat ID: ${chatId}`);
    }

    return parts.join("\n\n---\n\n");
  }

  buildMessages(
    history,
    summary,
    currentMessage,
    channel = "",
    chatId = "",
    profileHint = "",
  ) {
    let systemPrompt = this.buildSystemPrompt(channel, chatId, profileHint);

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
