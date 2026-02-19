const { DeepSeekProvider } = require("./deepseek");
const { OpenAICompatProvider } = require("./openai_compat");

function required(name, value) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
}

function createProviderFromEnv(env = process.env) {
  const providerName = (env.PROVIDER || "deepseek").toLowerCase();

  if (providerName === "deepseek") {
    required("DEEPSEEK_API_KEY", env.DEEPSEEK_API_KEY);

    const provider = new DeepSeekProvider(
      env.DEEPSEEK_API_KEY,
      env.DEEPSEEK_MODEL || "deepseek-chat",
    );

    return {
      provider,
      providerName: "deepseek",
      model: provider.model,
    };
  }

  if (providerName === "openai") {
    required("OPENAI_API_KEY", env.OPENAI_API_KEY);

    const provider = new OpenAICompatProvider({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      baseURL: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      name: "OpenAI",
    });

    return {
      provider,
      providerName: "openai",
      model: provider.model,
    };
  }

  if (providerName === "openai_compat") {
    required("OPENAI_COMPAT_API_KEY", env.OPENAI_COMPAT_API_KEY);
    required("OPENAI_COMPAT_BASE_URL", env.OPENAI_COMPAT_BASE_URL);

    const provider = new OpenAICompatProvider({
      apiKey: env.OPENAI_COMPAT_API_KEY,
      model: env.OPENAI_COMPAT_MODEL || "gpt-4o-mini",
      baseURL: env.OPENAI_COMPAT_BASE_URL,
      name: "OpenAI-Compatible",
    });

    return {
      provider,
      providerName: "openai_compat",
      model: provider.model,
    };
  }

  throw new Error(
    `Unsupported PROVIDER='${providerName}'. Supported: deepseek, openai, openai_compat`,
  );
}

module.exports = { createProviderFromEnv };
