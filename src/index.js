const { loadEnv } = require("./config/env");
loadEnv();

const path = require("path");
const { enforceSecurityPolicy } = require("./config/security");
const { initDb } = require("./db/database");
const { AgentLoop } = require("./agent/loop");
const { createProviderFromEnv } = require("./providers/factory");
const { ChannelManager } = require("./channels/manager");
const { createChannelsFromEnv } = require("./channels/factory");
const { ReminderService } = require("./reminders/service");
const { SubagentService } = require("./subagents/service");
const { startAdminServer } = require("./admin/backend/server");
const { getAllSettings, setSetting } = require("./db/database");
const fs = require("fs");
const dotenv = require("dotenv");

const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || "./workspace");
const DB_PATH = path.join(WORKSPACE_DIR, "data", "purrclaw.db");
const EMBED_ADMIN = String(process.env.ADMIN_EMBEDDED || "").trim().toLowerCase() === "true";

function parseAllowlist(raw) {
  if (!raw || !raw.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

async function syncEnvToDb() {
  const dbSettings = await getAllSettings();
  const dbKeys = new Set(dbSettings.map(s => s.key));
  
  // Read all potential keys from .env.example and .env
  let envSource = {};
  if (fs.existsSync(".env.example")) {
    Object.assign(envSource, dotenv.parse(fs.readFileSync(".env.example")));
  }
  if (fs.existsSync(".env")) {
    Object.assign(envSource, dotenv.parse(fs.readFileSync(".env")));
  }
  
  for (const [key, value] of Object.entries(envSource)) {
    if (!dbKeys.has(key)) {
      await setSetting(key, value || "", `Auto-imported from .env`);
    }
  }
  return await getAllSettings();
}

async function main() {
  console.log("🐾 PurrClaw starting up...");
  console.log(`   Workspace: ${WORKSPACE_DIR}`);
  console.log(`   Database:  ${DB_PATH}`);

  await initDb(DB_PATH);
  console.log("✅ Database initialized");

  const fullSettings = await syncEnvToDb();
  for (const row of fullSettings) {
    if (row.value) {
      process.env[row.key] = row.value;
    }
  }
  console.log("✅ Settings synchronized with DB");

  const allowedIdentities = parseAllowlist(process.env.ALLOWED_IDENTITIES || "");
  enforceSecurityPolicy(process.env, allowedIdentities);

  if (EMBED_ADMIN) {
    startAdminServer(process.env.ADMIN_PORT || 3000);
  } else {
    console.log("ℹ️ Embedded admin server disabled (set ADMIN_EMBEDDED=true to enable)");
  }

  const providerInfo = createProviderFromEnv(process.env);
  const provider = providerInfo.provider;
  console.log(
    `✅ Provider ready (${providerInfo.providerName}, model: ${providerInfo.model})`,
  );

  const reminderService = new ReminderService();
  const subagentService = new SubagentService();
  const agentLoop = new AgentLoop(provider, WORKSPACE_DIR, {
    reminderService,
    subagentService,
  });
  console.log(`✅ Agent loop ready (tools: ${agentLoop.tools.list().join(", ")})`);

  subagentService.setRunner(async (taskItem) => {
    const subSessionKey = `${taskItem.parentSessionKey}:subagent:${taskItem.id}`;
    return agentLoop.processMessage(
      subSessionKey,
      taskItem.task,
      taskItem.channel,
      taskItem.chatId,
      {
        canSpawnSubagents: false,
      },
    );
  });
  subagentService.start();

  const channelInfo = createChannelsFromEnv({
    env: process.env,
    agentLoop,
    allowedIdentities,
  });

  const channelManager = new ChannelManager(channelInfo.channels);
  await channelManager.start();

  reminderService.setNotifier(async ({ channel, chatId, text, meta }) => {
    await channelManager.send(channel, chatId, text, meta);
  });
  await reminderService.start();

  console.log(`✅ Channels started: ${channelInfo.enabled.join(", ")}`);
  console.log(
    `   Allowlist: ${allowedIdentities.size === 0 ? "disabled" : `${allowedIdentities.size} identities`}`,
  );

  console.log("\n🚀 PurrClaw is running! Press Ctrl+C to stop.\n");

  const shutdown = async (signal) => {
    console.log(`\n[main] Received ${signal}, shutting down...`);
    subagentService.stop();
    await channelManager.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT").catch((err) => {
      console.error("[main] Shutdown error:", err);
      process.exit(1);
    });
  });

  process.on("SIGTERM", () => {
    shutdown("SIGTERM").catch((err) => {
      console.error("[main] Shutdown error:", err);
      process.exit(1);
    });
  });

  process.on("uncaughtException", (err) => {
    console.error("[main] Uncaught exception:", err);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[main] Unhandled rejection:", reason);
  });
}

main().catch((err) => {
  console.error("❌ Fatal error:", err.message || err);
  process.exit(1);
});
