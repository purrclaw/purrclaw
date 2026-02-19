
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
      const result = await tool.execute(args, context);
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
