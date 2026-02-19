const { OpenAICompatProvider } = require("./openai_compat");

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

class DeepSeekProvider extends OpenAICompatProvider {
  constructor(apiKey, model = "deepseek-chat") {
    super({
      apiKey,
      model,
      baseURL: DEEPSEEK_BASE_URL,
      name: "DeepSeek",
    });
  }
}

module.exports = { DeepSeekProvider };
