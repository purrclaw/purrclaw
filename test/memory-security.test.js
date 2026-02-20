const test = require("node:test");
const assert = require("node:assert/strict");
const {
  memoryReadTool,
  memoryWriteTool,
  memoryDeleteTool,
  isProtectedMemoryKey,
} = require("../src/tools/memory");

test("protected memory key detection", () => {
  assert.equal(isProtectedMemoryKey("telegram:user_session"), true);
  assert.equal(isProtectedMemoryKey("system:runtime"), true);
  assert.equal(isProtectedMemoryKey("internal:secret"), true);
  assert.equal(isProtectedMemoryKey("session:telegram:123:user_note"), false);
});

test("memory_read denies protected keys", async () => {
  const tool = memoryReadTool();
  const result = await tool.execute(
    { key: "telegram:user_session", scope: "global" },
    { sessionKey: "telegram:1" },
  );
  assert.equal(result.isError, true);
  assert.match(result.forLLM, /protected memory key/i);
});

test("memory_write denies protected keys", async () => {
  const tool = memoryWriteTool();
  const result = await tool.execute(
    { key: "telegram:user_session", value: "x", scope: "global" },
    { sessionKey: "telegram:1" },
  );
  assert.equal(result.isError, true);
  assert.match(result.forLLM, /protected memory key/i);
});

test("memory_delete denies protected keys", async () => {
  const tool = memoryDeleteTool();
  const result = await tool.execute(
    { key: "telegram:user_session", scope: "global" },
    { sessionKey: "telegram:1" },
  );
  assert.equal(result.isError, true);
  assert.match(result.forLLM, /protected memory key/i);
});
