const { TelegramChannel } = require("./telegram");
const { DiscordChannel } = require("./discord");
const { SlackChannel } = require("./slack");
const { WhatsAppChannel } = require("./whatsapp");

function parseEnabledChannels(raw) {
  if (!raw || !raw.trim()) {
    return ["telegram"];
  }

  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function createChannelsFromEnv({ env, agentLoop, allowedIdentities }) {
  const enabled = parseEnabledChannels(env.ENABLED_CHANNELS);
  const channels = [];

  for (const name of enabled) {
    if (name === "telegram") {
      if (!env.TELEGRAM_TOKEN) {
        throw new Error(
          "TELEGRAM_TOKEN is required when ENABLED_CHANNELS includes telegram",
        );
      }
      channels.push(
        new TelegramChannel(env.TELEGRAM_TOKEN, agentLoop, allowedIdentities),
      );
      continue;
    }

    if (name === "discord") {
      if (!env.DISCORD_TOKEN) {
        throw new Error(
          "DISCORD_TOKEN is required when ENABLED_CHANNELS includes discord",
        );
      }
      channels.push(
        new DiscordChannel(env.DISCORD_TOKEN, agentLoop, allowedIdentities),
      );
      continue;
    }

    if (name === "slack") {
      if (!env.SLACK_BOT_TOKEN || !env.SLACK_APP_TOKEN) {
        throw new Error(
          "SLACK_BOT_TOKEN and SLACK_APP_TOKEN are required when ENABLED_CHANNELS includes slack",
        );
      }
      channels.push(
        new SlackChannel(
          {
            botToken: env.SLACK_BOT_TOKEN,
            appToken: env.SLACK_APP_TOKEN,
            signingSecret: env.SLACK_SIGNING_SECRET || "",
          },
          agentLoop,
          allowedIdentities,
        ),
      );
      continue;
    }

    if (name === "whatsapp") {
      channels.push(new WhatsAppChannel(agentLoop, allowedIdentities));
      continue;
    }

    throw new Error(
      `Unsupported channel '${name}'. Supported: telegram, discord, slack, whatsapp`,
    );
  }

  if (channels.length === 0) {
    throw new Error(
      "No channels enabled. Set ENABLED_CHANNELS to at least one channel.",
    );
  }

  return { channels, enabled };
}

module.exports = { parseEnabledChannels, createChannelsFromEnv };
