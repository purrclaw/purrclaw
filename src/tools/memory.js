"use strict";

const { getMemory, setMemory } = require("../db/database");

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

module.exports = { memoryReadTool, memoryWriteTool };
