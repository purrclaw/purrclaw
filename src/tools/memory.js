
const {
  getMemory,
  setMemory,
  listMemory,
  deleteMemory,
} = require("../db/database");

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
    },
    required: ["key"],
  },
  async execute(args) {
    const { key } = args;
    if (!key) return { forLLM: "key is required", isError: true };
    const value = await getMemory(key);
    if (value === null) {
      return {
        forLLM: `No memory found for key: ${key}`,
        forUser: `No memory found for key: ${key}`,
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
    },
    required: ["key", "value"],
  },
  async execute(args) {
    const { key, value } = args;
    if (!key) return { forLLM: "key is required", isError: true };
    if (value === undefined)
      return { forLLM: "value is required", isError: true };
    await setMemory(key, String(value));
    return {
      forLLM: `Memory saved: ${key} = ${value}`,
      forUser: `✅ Remembered: ${key}`,
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
    },
    required: [],
  },
  async execute(args) {
    const limit = args && args.limit ? Number(args.limit) : 50;
    const rows = await listMemory(limit);
    if (!rows.length) {
      return {
        forLLM: "Memory is empty.",
        forUser: "Memory is empty.",
        isError: false,
      };
    }

    const lines = rows.map((row) => `${row.key} = ${row.value}`);
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
    },
    required: ["key"],
  },
  async execute(args) {
    const { key } = args;
    if (!key) return { forLLM: "key is required", isError: true };
    const deleted = await deleteMemory(key);
    if (!deleted) {
      return {
        forLLM: `No memory found for key: ${key}`,
        forUser: `No memory found for key: ${key}`,
        isError: false,
      };
    }
    return {
      forLLM: `Memory deleted: ${key}`,
      forUser: `✅ Memory deleted: ${key}`,
      isError: false,
    };
  },
});

module.exports = {
  memoryReadTool,
  memoryWriteTool,
  memoryListTool,
  memoryDeleteTool,
};
