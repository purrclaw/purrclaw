const { DeepSeekProvider } = require("./deepseek");
const { OpenAICompatProvider } = require("./openai_compat");
const { FallbackProvider } = require("./fallback");

function required(name, value) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
}

function pick(env, key, prefix = "") {
  if (!prefix) return env[key];
  return env[`${prefix}_${key}`] || env[key];
}

function createSingleProvider(providerName, env = process.env, prefix = "") {
  const name = String(providerName || "").toLowerCase();

  if (name === "deepseek") {
    const apiKey = pick(env, "DEEPSEEK_API_KEY", prefix);
    required(`${prefix ? `${prefix}_` : ""}DEEPSEEK_API_KEY`, apiKey);

    return {
      provider: new DeepSeekProvider(
        apiKey,
        pick(env, "DEEPSEEK_MODEL", prefix) || "deepseek-chat",
      ),
      providerName: "deepseek",
    };
  }

  if (name === "openai") {
    const apiKey = pick(env, "OPENAI_API_KEY", prefix);
    required(`${prefix ? `${prefix}_` : ""}OPENAI_API_KEY`, apiKey);

    return {
      provider: new OpenAICompatProvider({
        apiKey,
        model: pick(env, "OPENAI_MODEL", prefix) || "gpt-4o-mini",
        baseURL: pick(env, "OPENAI_BASE_URL", prefix) || "https://api.openai.com/v1",
        name: "OpenAI",
      }),
      providerName: "openai",
    };
  }

  if (name === "openai_compat") {
    const apiKey = pick(env, "OPENAI_COMPAT_API_KEY", prefix);
    const baseURL = pick(env, "OPENAI_COMPAT_BASE_URL", prefix);
    required(`${prefix ? `${prefix}_` : ""}OPENAI_COMPAT_API_KEY`, apiKey);
    required(`${prefix ? `${prefix}_` : ""}OPENAI_COMPAT_BASE_URL`, baseURL);

    return {
      provider: new OpenAICompatProvider({
        apiKey,
        model: pick(env, "OPENAI_COMPAT_MODEL", prefix) || "gpt-4o-mini",
        baseURL,
        name: "OpenAI-Compatible",
      }),
      providerName: "openai_compat",
    };
  }

  throw new Error(
    `Unsupported provider '${name}'. Supported: deepseek, openai, openai_compat`,
  );
}

function createProviderFromEnv(env = process.env) {
  const providerName = (env.PROVIDER || "deepseek").toLowerCase();
  const fallbackProviderName = String(env.FALLBACK_PROVIDER || "").trim().toLowerCase();
  const primaryInfo = createSingleProvider(providerName, env);

  if (!fallbackProviderName) {
    return {
      provider: primaryInfo.provider,
      providerName: primaryInfo.providerName,
      model: primaryInfo.provider.model,
    };
  }

  const fallbackInfo = createSingleProvider(
    fallbackProviderName,
    env,
    "FALLBACK",
  );
  const provider = new FallbackProvider(
    primaryInfo.provider,
    fallbackInfo.provider,
  );

  return {
    provider,
    providerName: `${primaryInfo.providerName}->${fallbackInfo.providerName}`,
    model: primaryInfo.provider.model,
  };
}

module.exports = { createProviderFromEnv };
