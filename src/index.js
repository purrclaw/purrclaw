
const env = process.env.NODE_ENV || "development";
require("dotenv").config({ path: `.env.${env}`, override: false });
require("dotenv").config({ path: ".env.local", override: true });
require("dotenv").config({ path: ".env", override: false });

const path = require("path");
const { initDb } = require("./db/database");
const { DeepSeekProvider } = require("./providers/deepseek");
const { AgentLoop } = require("./agent/loop");
const { TelegramChannel } = require("./channels/telegram");

// ─── Config ──────────────────────────────────────────────────────────────────

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || "./workspace");
const DB_PATH = path.join(WORKSPACE_DIR, "data", "purrclaw.db");

// ─── Validation ───────────────────────────────────────────────────────────────

if (!TELEGRAM_TOKEN) {
  console.error("❌ TELEGRAM_TOKEN is required. Set it in .env");
  process.exit(1);
}

if (!DEEPSEEK_API_KEY) {
  console.error("❌ DEEPSEEK_API_KEY is required. Set it in .env");
  process.exit(1);
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function main() {
  console.log("🐾 PurrClaw starting up...");
  console.log(`   Workspace: ${WORKSPACE_DIR}`);
  console.log(`   Database:  ${DB_PATH}`);
  console.log(`   Model:     ${DEEPSEEK_MODEL}`);

  // Initialize SQLite database
  await initDb(DB_PATH);
  console.log("✅ Database initialized");

  // Create DeepSeek provider
  const provider = new DeepSeekProvider(DEEPSEEK_API_KEY, DEEPSEEK_MODEL);
  console.log("✅ DeepSeek provider ready");

  // Create agent loop
  const agentLoop = new AgentLoop(provider, WORKSPACE_DIR);
  console.log(
    `✅ Agent loop ready (tools: ${agentLoop.tools.list().join(", ")})`,
  );

  // Start Telegram channel
  const telegram = new TelegramChannel(TELEGRAM_TOKEN, agentLoop);
  telegram.start();
  console.log("✅ Telegram bot started");

  console.log("\n🚀 PurrClaw is running! Press Ctrl+C to stop.\n");

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n[main] Received ${signal}, shutting down...`);
    telegram.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("uncaughtException", (err) => {
    console.error("[main] Uncaught exception:", err);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[main] Unhandled rejection:", reason);
  });
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
