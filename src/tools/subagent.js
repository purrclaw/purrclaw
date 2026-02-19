function noService() {
  return {
    forLLM: "Subagent service is not configured",
    forUser: "Subagent service is not configured",
    isError: true,
  };
}

function canSpawn(context = {}) {
  return context.canSpawnSubagents !== false;
}

const spawnSubagentTool = (subagentService) => ({
  name: "spawn_subagent",
  description:
    "Run a task in an isolated subagent context asynchronously and return subagent id",
  parameters: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "Task for subagent to execute",
      },
    },
    required: ["task"],
  },
  async execute(args, context = {}) {
    if (!subagentService) return noService();
    if (!canSpawn(context)) {
      return {
        forLLM: "Nested subagent spawning is disabled",
        forUser: "Nested subagent spawning is disabled",
        isError: true,
      };
    }

    try {
      const item = await subagentService.spawn(args?.task, context);
      const msg = `Subagent started: id=${item.id}, status=${item.status}`;
      return { forLLM: msg, forUser: `✅ ${msg}`, isError: false };
    } catch (err) {
      const msg = `Failed to spawn subagent: ${err.message}`;
      return { forLLM: msg, forUser: msg, isError: true };
    }
  },
});

const subagentStatusTool = (subagentService) => ({
  name: "subagent_status",
  description: "Get status for a previously spawned subagent by id",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Subagent id returned by spawn_subagent",
      },
    },
    required: ["id"],
  },
  async execute(args, context = {}) {
    if (!subagentService) return noService();
    const id = String(args?.id || "").trim();
    if (!id) return { forLLM: "id is required", forUser: "id is required", isError: true };

    const item = subagentService.get(id);
    if (!item) {
      return { forLLM: `Subagent not found: ${id}`, forUser: `Subagent not found: ${id}`, isError: false };
    }

    if (item.parentSessionKey !== String(context.sessionKey || "")) {
      return {
        forLLM: "Access denied for subagent id",
        forUser: "Access denied for subagent id",
        isError: true,
      };
    }

    const msg = `id=${item.id}\nstatus=${item.status}\ncreated_at=${new Date(item.createdAt).toISOString()}\nupdated_at=${new Date(item.updatedAt).toISOString()}`;
    return { forLLM: msg, forUser: msg, isError: false };
  },
});

const subagentResultTool = (subagentService) => ({
  name: "subagent_result",
  description: "Get final result/error for a completed/failed subagent by id",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Subagent id returned by spawn_subagent",
      },
    },
    required: ["id"],
  },
  async execute(args, context = {}) {
    if (!subagentService) return noService();
    const id = String(args?.id || "").trim();
    if (!id) return { forLLM: "id is required", forUser: "id is required", isError: true };

    const item = subagentService.get(id);
    if (!item) {
      return { forLLM: `Subagent not found: ${id}`, forUser: `Subagent not found: ${id}`, isError: false };
    }

    if (item.parentSessionKey !== String(context.sessionKey || "")) {
      return {
        forLLM: "Access denied for subagent id",
        forUser: "Access denied for subagent id",
        isError: true,
      };
    }

    if (item.status === "queued" || item.status === "running") {
      return {
        forLLM: `Subagent ${id} is still ${item.status}`,
        forUser: `Subagent ${id} is still ${item.status}`,
        isError: false,
      };
    }

    if (item.status === "failed") {
      return {
        forLLM: `Subagent ${id} failed: ${item.error}`,
        forUser: `Subagent ${id} failed: ${item.error}`,
        isError: true,
      };
    }

    return {
      forLLM: item.result || "(empty result)",
      forUser: item.result || "(empty result)",
      isError: false,
    };
  },
});

const subagentListTool = (subagentService) => ({
  name: "subagent_list",
  description: "List subagents for the current session",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute(args, context = {}) {
    if (!subagentService) return noService();
    const items = subagentService.listBySession(context.sessionKey || "");
    if (!items.length) {
      return { forLLM: "No subagents found.", forUser: "No subagents found.", isError: false };
    }
    const out = items
      .slice(0, 20)
      .map((item) => `${item.id} | ${item.status} | ${item.task.slice(0, 80)}`)
      .join("\n");
    return { forLLM: out, forUser: out, isError: false };
  },
});

module.exports = {
  spawnSubagentTool,
  subagentStatusTool,
  subagentResultTool,
  subagentListTool,
};
