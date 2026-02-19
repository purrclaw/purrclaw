const axios = require("axios");

class OpenAICompatProvider {
  constructor({ apiKey, model, baseURL, name = "openai-compatible" }) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = baseURL;
    this.name = name;

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 120000,
    });
  }

  async chat(messages, tools = [], model = null, options = {}) {
    const payload = {
      model: model || this.model,
      messages: messages.map((m) => this._formatMessage(m)),
      max_tokens: options.max_tokens || 8192,
      temperature:
        options.temperature !== undefined ? options.temperature : 0.7,
    };

    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = "auto";
    }

    try {
      const response = await this.client.post("/chat/completions", payload);
      const choice = response.data.choices[0] || {};
      const msg = choice.message || {};

      const result = {
        content: msg.content || "",
        tool_calls: [],
      };

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        result.tool_calls = msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: tc.type,
          name: tc.function.name,
          arguments: this._parseArgs(tc.function.arguments),
        }));
      }

      return result;
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message;
      throw new Error(`${this.name} API error: ${msg}`);
    }
  }

  _formatMessage(msg) {
    const out = { role: msg.role, content: msg.content || "" };

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      out.tool_calls = msg.tool_calls.map((tc) => ({
        id: tc.id,
        type: tc.type || "function",
        function: {
          name: tc.function ? tc.function.name : tc.name,
          arguments: tc.function
            ? tc.function.arguments
            : JSON.stringify(tc.arguments || {}),
        },
      }));
    }

    if (msg.tool_call_id) {
      out.tool_call_id = msg.tool_call_id;
      out.role = "tool";
    }

    return out;
  }

  _parseArgs(args) {
    if (typeof args === "object") return args;
    try {
      return JSON.parse(args);
    } catch {
      return {};
    }
  }
}

module.exports = { OpenAICompatProvider };
