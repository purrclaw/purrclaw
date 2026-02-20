
const {
  getMemory,
  setMemory,
  listMemory,
  deleteMemory,
} = require("../db/database");

const PROTECTED_GLOBAL_MEMORY_KEYS = new Set(["telegram:user_session"]);

function isProtectedMemoryKey(key) {
  const normalized = String(key || "").trim().toLowerCase();
  if (!normalized) return false;
  if (PROTECTED_GLOBAL_MEMORY_KEYS.has(normalized)) return true;
  if (normalized.startsWith("system:")) return true;
  if (normalized.startsWith("internal:")) return true;
  return false;
}

function protectedKeyError(scope, key) {
  const msg = `Access denied: protected memory key (${scope}:${key})`;
  return {
    forLLM: msg,
    forUser: "⛔ Access denied: protected memory key.",
    isError: true,
  };
}

function buildScopedKey(key, scope, context = {}) {
  if (scope === "global") return key;
  if (scope && scope !== "session") {
    return `${scope}:${key}`;
  }
  const sessionKey = context.sessionKey || "unknown";
  return `session:${sessionKey}:${key}`;
}

function unscopedDisplay(scopedKey, context = {}) {
  const prefix = `session:${context.sessionKey || "unknown"}:`;
  if (scopedKey.startsWith(prefix)) return scopedKey.slice(prefix.length);
  return scopedKey;
}

const memoryReadTool = () => ({
  name: "memory_read",
  description: "Read a value from persistent memory by key",
  parameters: {
    type: "object",
    properties: {
      key: {
        type: "string",
        description: "Memory key to read (e.g. 'user_name', 'preferences')",
      },
      scope: {
        type: "string",
        description: "Memory scope: session (default) or global",
      },
    },
    required: ["key"],
  },
  async execute(args, context) {
    const { key, scope = "session" } = args;
    if (!key) return { forLLM: "key is required", isError: true };
    const scopedKey = buildScopedKey(key, scope, context);
    if (isProtectedMemoryKey(key) || isProtectedMemoryKey(scopedKey)) {
      return protectedKeyError(scope, key);
    }
    const value = await getMemory(scopedKey);
    if (value === null) {
      return {
        forLLM: `No memory found for key: ${key} (scope: ${scope})`,
        forUser: `No memory found for key: ${key} (scope: ${scope})`,
        isError: false,
      };
    }
    return { forLLM: value, forUser: value, isError: false };
  },
});

const memoryWriteTool = () => ({
  name: "memory_write",
  description: "Write a value to persistent memory",
  parameters: {
    type: "object",
    properties: {
      key: {
        type: "string",
        description: "Memory key to write",
      },
      value: {
        type: "string",
        description: "Value to store",
      },
      scope: {
        type: "string",
        description: "Memory scope: session (default) or global",
      },
    },
    required: ["key", "value"],
  },
  async execute(args, context) {
    const { key, value, scope = "session" } = args;
    if (!key) return { forLLM: "key is required", isError: true };
    if (value === undefined)
      return { forLLM: "value is required", isError: true };
    const scopedKey = buildScopedKey(key, scope, context);
    if (isProtectedMemoryKey(key) || isProtectedMemoryKey(scopedKey)) {
      return protectedKeyError(scope, key);
    }
    await setMemory(scopedKey, String(value));
    return {
      forLLM: `Memory saved (${scope}): ${key} = ${value}`,
      forUser: `✅ Remembered (${scope}): ${key}`,
      isError: false,
    };
  },
});

const memoryListTool = () => ({
  name: "memory_list",
  description: "List memory keys with latest values",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Max number of memory entries to return (default: 50)",
      },
      scope: {
        type: "string",
        description: "Memory scope: session (default) or global",
      },
    },
    required: [],
  },
  async execute(args, context) {
    const limit = args && args.limit ? Number(args.limit) : 50;
    const scope = String(args?.scope || "session");
    const rows = await listMemory(limit);
    const visibleRows = rows.filter((row) => !isProtectedMemoryKey(row.key));
    const filtered =
      scope === "global"
        ? visibleRows.filter((row) => !String(row.key).startsWith("session:"))
        : visibleRows.filter((row) =>
            String(row.key).startsWith(`session:${context.sessionKey || "unknown"}:`),
          );
    if (!filtered.length) {
      return {
        forLLM: `Memory is empty for scope: ${scope}.`,
        forUser: `Memory is empty for scope: ${scope}.`,
        isError: false,
      };
    }

    const lines = filtered.map(
      (row) => `${unscopedDisplay(String(row.key), context)} = ${row.value}`,
    );
    const out = lines.join("\n");
    return { forLLM: out, forUser: out, isError: false };
  },
});

const memoryDeleteTool = () => ({
  name: "memory_delete",
  description: "Delete a value from persistent memory by key",
  parameters: {
    type: "object",
    properties: {
      key: {
        type: "string",
        description: "Memory key to delete",
      },
      scope: {
        type: "string",
        description: "Memory scope: session (default) or global",
      },
    },
    required: ["key"],
  },
  async execute(args, context) {
    const { key, scope = "session" } = args;
    if (!key) return { forLLM: "key is required", isError: true };
    const scopedKey = buildScopedKey(key, scope, context);
    if (isProtectedMemoryKey(key) || isProtectedMemoryKey(scopedKey)) {
      return protectedKeyError(scope, key);
    }
    const deleted = await deleteMemory(scopedKey);
    if (!deleted) {
      return {
        forLLM: `No memory found for key: ${key} (scope: ${scope})`,
        forUser: `No memory found for key: ${key} (scope: ${scope})`,
        isError: false,
      };
    }
    return {
      forLLM: `Memory deleted (${scope}): ${key}`,
      forUser: `✅ Memory deleted (${scope}): ${key}`,
      isError: false,
    };
  },
});

module.exports = {
  memoryReadTool,
  memoryWriteTool,
  memoryListTool,
  memoryDeleteTool,
  isProtectedMemoryKey,
};
