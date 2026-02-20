function parseCsvTokens(raw) {
  return String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseEnabledChannels(raw) {
  if (!raw || !String(raw).trim()) {
    return ["telegram"];
  }

  return String(raw || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function enforceSecurityPolicy(env = process.env, allowedIdentities = new Set()) {
  const nodeEnv = String(env.NODE_ENV || "development").trim().toLowerCase();
  if (nodeEnv !== "production") return;

  const fsPassword = String(env.FS_ACCESS_PASSWORD || "").trim();
  if (!fsPassword) {
    throw new Error(
      "FS_ACCESS_PASSWORD is required in production (filesystem tools remain locked without it).",
    );
  }

  const enabledChannels = parseEnabledChannels(env.ENABLED_CHANNELS || "telegram");
  const hasNonTelegramUserChannels = enabledChannels.some(
    (name) => name && name !== "telegram_user",
  );

  if (hasNonTelegramUserChannels && (!allowedIdentities || allowedIdentities.size === 0)) {
    throw new Error(
      "ALLOWED_IDENTITIES must be non-empty in production when running telegram/discord/slack/whatsapp channels.",
    );
  }

  if (enabledChannels.includes("telegram_user")) {
    const allowedPeers = parseCsvTokens(env.TELEGRAM_USER_ALLOWED_PEERS);
    if (allowedPeers.length === 0) {
      throw new Error(
        "TELEGRAM_USER_ALLOWED_PEERS must be non-empty in production when telegram_user channel is enabled.",
      );
    }
  }
}

module.exports = {
  parseCsvTokens,
  enforceSecurityPolicy,
};
