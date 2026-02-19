
class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(tool) {
    this.tools.set(tool.name, tool);
  }

  get(name) {
    return this.tools.get(name);
  }

  list() {
    return Array.from(this.tools.keys());
  }

  /**
   * Returns tool definitions in OpenAI/DeepSeek function-calling format.
   */
  toProviderDefs() {
    return Array.from(this.tools.values()).map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Execute a tool by name with given arguments.
   * Returns { forLLM, forUser, isError, silent }
   */
  async execute(name, args, context = {}) {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        forLLM: `Tool '${name}' not found`,
        forUser: `Tool '${name}' not found`,
        isError: true,
        silent: false,
      };
    }

    try {
      const timeoutMs = Number(
        context.toolTimeoutMs || process.env.TOOL_TIMEOUT_MS || 45000,
      );

      const result = await Promise.race([
        tool.execute(args, context),
        new Promise((_, reject) => {
          if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return;
          setTimeout(
            () => reject(new Error(`Tool timeout after ${timeoutMs}ms`)),
            timeoutMs,
          );
        }),
      ]);
      return result;
    } catch (err) {
      return {
        forLLM: `Tool error: ${err.message}`,
        forUser: `Tool error: ${err.message}`,
        isError: true,
        silent: false,
      };
    }
  }

  getSummaries() {
    return Array.from(this.tools.values()).map(
      (t) => `- **${t.name}**: ${t.description}`,
    );
  }
}

module.exports = { ToolRegistry };
