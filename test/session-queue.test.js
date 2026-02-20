const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { AgentLoop } = require("../src/agent/loop");

function createAgentLoop() {
  const provider = {
    model: "test-model",
    async chat() {
      return { content: "ok", tool_calls: [] };
    },
  };
  return new AgentLoop(provider, path.resolve(__dirname, "..", "workspace"));
}

test("session queue preserves order within same session", async () => {
  const agent = createAgentLoop();
  const order = [];

  const first = agent._enqueueSessionTask("session:a", async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
    order.push("first");
    return "first";
  });

  const second = agent._enqueueSessionTask("session:a", async () => {
    order.push("second");
    return "second";
  });

  const [r1, r2] = await Promise.all([first, second]);
  assert.equal(r1, "first");
  assert.equal(r2, "second");
  assert.deepEqual(order, ["first", "second"]);
});

test("session queue allows concurrent execution for different sessions", async () => {
  const agent = createAgentLoop();
  const started = [];

  const a = agent._enqueueSessionTask("session:a", async () => {
    started.push("a");
    await new Promise((resolve) => setTimeout(resolve, 50));
    return "a";
  });

  const b = agent._enqueueSessionTask("session:b", async () => {
    started.push("b");
    return "b";
  });

  await Promise.all([a, b]);
  assert.equal(started.includes("a"), true);
  assert.equal(started.includes("b"), true);
});
