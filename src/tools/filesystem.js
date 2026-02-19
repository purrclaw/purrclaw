
const fs = require("fs");
const path = require("path");

function validatePath(filePath, workspace, restrict) {
  const absWorkspace = path.resolve(workspace);
  let absPath;
  if (path.isAbsolute(filePath)) {
    absPath = path.normalize(filePath);
  } else {
    absPath = path.resolve(absWorkspace, filePath);
  }

  if (restrict) {
    const rel = path.relative(absWorkspace, absPath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error("Access denied: path is outside the workspace");
    }
  }

  return absPath;
}

// ─── read_file ────────────────────────────────────────────────────────────────

const readFileTool = (workspace, restrict = true) => ({
  name: "read_file",
  description: "Read the contents of a file",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file to read" },
    },
    required: ["path"],
  },
  async execute(args) {
    const filePath = args.path;
    if (!filePath) return { forLLM: "path is required", isError: true };
    try {
      const resolved = validatePath(filePath, workspace, restrict);
      const content = fs.readFileSync(resolved, "utf8");
      return { forLLM: content, forUser: content, isError: false };
    } catch (err) {
      return { forLLM: err.message, forUser: err.message, isError: true };
    }
  },
});

// ─── write_file ───────────────────────────────────────────────────────────────

const writeFileTool = (workspace, restrict = true) => ({
  name: "write_file",
  description: "Write content to a file",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file to write" },
      content: {
        type: "string",
        description: "Content to write to the file",
      },
    },
    required: ["path", "content"],
  },
  async execute(args) {
    const { path: filePath, content } = args;
    if (!filePath) return { forLLM: "path is required", isError: true };
    try {
      const resolved = validatePath(filePath, workspace, restrict);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, content || "", "utf8");
      return {
        forLLM: `File written: ${filePath}`,
        forUser: `✅ File written: ${filePath}`,
        isError: false,
        silent: false,
      };
    } catch (err) {
      return { forLLM: err.message, forUser: err.message, isError: true };
    }
  },
});

// ─── append_file ──────────────────────────────────────────────────────────────

const appendFileTool = (workspace, restrict = true) => ({
  name: "append_file",
  description: "Append content to a file",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file" },
      content: { type: "string", description: "Content to append" },
    },
    required: ["path", "content"],
  },
  async execute(args) {
    const { path: filePath, content } = args;
    if (!filePath) return { forLLM: "path is required", isError: true };
    try {
      const resolved = validatePath(filePath, workspace, restrict);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.appendFileSync(resolved, content || "", "utf8");
      return {
        forLLM: `Appended to: ${filePath}`,
        forUser: `✅ Appended to: ${filePath}`,
        isError: false,
      };
    } catch (err) {
      return { forLLM: err.message, forUser: err.message, isError: true };
    }
  },
});

// ─── list_dir ─────────────────────────────────────────────────────────────────

const listDirTool = (workspace, restrict = true) => ({
  name: "list_dir",
  description: "List files and directories in a path",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to list (default: .)" },
    },
    required: [],
  },
  async execute(args) {
    const filePath = args.path || ".";
    try {
      const resolved = validatePath(filePath, workspace, restrict);
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const lines = entries.map((e) =>
        e.isDirectory() ? `DIR:  ${e.name}` : `FILE: ${e.name}`,
      );
      const result = lines.join("\n") || "(empty directory)";
      return { forLLM: result, forUser: result, isError: false };
    } catch (err) {
      return { forLLM: err.message, forUser: err.message, isError: true };
    }
  },
});

// ─── send_telegram_file ──────────────────────────────────────────────────────

const sendTelegramFileTool = (workspace, restrict = true) => ({
  name: "send_telegram_file",
  description:
    "Send a file from the workspace to the current Telegram chat (Telegram sessions only)",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file in workspace" },
      caption: {
        type: "string",
        description: "Optional caption for the file",
      },
    },
    required: ["path"],
  },
  async execute(args, context = {}) {
    const filePath = args.path;
    const caption = args.caption ? String(args.caption) : "";

    if (!filePath) {
      return { forLLM: "path is required", forUser: "path is required", isError: true };
    }

    if (String(context.channel || "") !== "telegram") {
      return {
        forLLM: "send_telegram_file works only in Telegram sessions",
        forUser: "send_telegram_file works only in Telegram sessions",
        isError: true,
      };
    }

    if (typeof context.sendTelegramFile !== "function") {
      return {
        forLLM: "Telegram sender is not available in this context",
        forUser: "Telegram sender is not available in this context",
        isError: true,
      };
    }

    try {
      const resolved = validatePath(filePath, workspace, restrict);
      if (!fs.existsSync(resolved)) {
        return {
          forLLM: `File not found: ${filePath}`,
          forUser: `File not found: ${filePath}`,
          isError: true,
        };
      }

      const stat = fs.statSync(resolved);
      if (!stat.isFile()) {
        return {
          forLLM: `Not a file: ${filePath}`,
          forUser: `Not a file: ${filePath}`,
          isError: true,
        };
      }

      await context.sendTelegramFile({ path: resolved, caption });

      return {
        forLLM: `File sent to Telegram: ${filePath}`,
        forUser: `✅ File sent to Telegram: ${filePath}`,
        isError: false,
      };
    } catch (err) {
      return { forLLM: err.message, forUser: err.message, isError: true };
    }
  },
});

module.exports = {
  readFileTool,
  writeFileTool,
  appendFileTool,
  listDirTool,
  sendTelegramFileTool,
};
