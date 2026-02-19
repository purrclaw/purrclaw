const fs = require("fs");
const path = require("path");

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".idea",
  ".vscode",
]);

function walkFiles(dir, out = [], maxFiles = 300) {
  if (out.length >= maxFiles) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (out.length >= maxFiles) break;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkFiles(full, out, maxFiles);
      continue;
    }
    out.push(full);
  }
  return out;
}

function isLikelyText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) return true;
  return ![".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".tar", ".gz", ".mp4", ".mov", ".mp3", ".wav"].includes(ext);
}

const workspaceSearchTool = (workspace, restrict = true) => ({
  name: "workspace_search",
  description: "Search workspace files and return relevant matching lines with file paths",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Text to search for" },
      max_results: { type: "integer", description: "Maximum number of matches (default: 20, max: 100)" },
      path: { type: "string", description: "Optional relative subdirectory to search" },
    },
    required: ["query"],
  },
  async execute(args) {
    try {
      const query = String(args?.query || "").trim();
      if (!query) {
        return { forLLM: "query is required", forUser: "query is required", isError: true };
      }

      const root = path.resolve(workspace, String(args?.path || "."));
      const absWorkspace = path.resolve(workspace);
      const rel = path.relative(absWorkspace, root);
      if (restrict && (rel.startsWith("..") || path.isAbsolute(rel))) {
        return {
          forLLM: "Access denied: path is outside the workspace",
          forUser: "Access denied: path is outside the workspace",
          isError: true,
        };
      }

      const maxResults = Math.max(1, Math.min(Number(args?.max_results || 20), 100));
      const files = walkFiles(root, [], 400).filter(isLikelyText);
      const q = query.toLowerCase();
      const matches = [];

      for (const file of files) {
        if (matches.length >= maxResults) break;
        let content;
        try {
          content = fs.readFileSync(file, "utf8");
        } catch {
          continue;
        }

        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.toLowerCase().includes(q)) {
            matches.push({
              file: path.relative(absWorkspace, file) || path.basename(file),
              line: i + 1,
              text: line.trim().slice(0, 300),
            });
            if (matches.length >= maxResults) break;
          }
        }
      }

      if (!matches.length) {
        return {
          forLLM: `No matches found for '${query}'`,
          forUser: `No matches found for '${query}'`,
          isError: false,
        };
      }

      const out = matches
        .map((m, idx) => `${idx + 1}. ${m.file}:${m.line}\n${m.text}`)
        .join("\n\n");

      return { forLLM: out, forUser: out, isError: false };
    } catch (err) {
      const msg = `workspace_search failed: ${err.message}`;
      return { forLLM: msg, forUser: msg, isError: true };
    }
  },
});

module.exports = { workspaceSearchTool };
