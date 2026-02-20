const { loadEnv } = require("../config/env");
loadEnv();

const path = require("path");
const readline = require("readline/promises");
const { stdin, stdout } = require("node:process");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { initDb, setMemory } = require("../db/database");

const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || "./workspace");
const DB_PATH = path.join(WORKSPACE_DIR, "data", "purrclaw.db");
const SESSION_KEY = "telegram:user_session";

async function ask(rl, label) {
  const value = await rl.question(label);
  return String(value || "").trim();
}

async function main() {
  const apiId = Number(process.env.TELEGRAM_API_ID || 0);
  const apiHash = String(process.env.TELEGRAM_API_HASH || "").trim();

  if (!apiId || !apiHash) {
    throw new Error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in env first");
  }

  await initDb(DB_PATH);

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const session = new StringSession("");
  const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });

  try {
    await client.start({
      phoneNumber: async () => ask(rl, "Phone (+...): "),
      phoneCode: async () => ask(rl, "Code from Telegram: "),
      password: async () => ask(rl, "2FA password (if enabled): "),
      onError: (err) => {
        throw err;
      },
    });

    const sessionString = client.session.save();
    await setMemory(SESSION_KEY, sessionString);

    const me = await client.getMe();
    console.log(`Saved Telegram user session for @${me?.username || "unknown"} (id: ${me?.id || "n/a"})`);
    console.log("Now set ENABLED_CHANNELS=telegram_user and run npm start");
  } finally {
    rl.close();
    await client.disconnect().catch(() => {});
  }
}

main().catch((err) => {
  console.error("Login failed:", err.message || err);
  process.exit(1);
});
