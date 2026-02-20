const { loadEnv } = require("../config/env");
loadEnv();

const path = require("path");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { initDb, deleteMemory, getMemory } = require("../db/database");

const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || "./workspace");
const DB_PATH = path.join(WORKSPACE_DIR, "data", "purrclaw.db");
const SESSION_KEY = "telegram:user_session";

async function main() {
  const apiId = Number(process.env.TELEGRAM_API_ID || 0);
  const apiHash = String(process.env.TELEGRAM_API_HASH || "").trim();

  await initDb(DB_PATH);

  const session = (await getMemory(SESSION_KEY)) || process.env.TELEGRAM_USER_SESSION || "";
  if (!session) {
    console.log("No saved telegram user session found. Nothing to revoke.");
    return;
  }

  if (!apiId || !apiHash) {
    await deleteMemory(SESSION_KEY);
    console.log("Session removed locally (API credentials missing, server-side logout skipped).");
    return;
  }

  const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 5,
  });

  try {
    await client.connect();
    await client.invoke(new Api.auth.LogOut());
    console.log("Telegram session logged out on server side.");
  } catch (err) {
    console.warn("Logout warning:", err.message);
  } finally {
    await deleteMemory(SESSION_KEY);
    await client.disconnect().catch(() => {});
  }

  console.log("Local session removed.");
}

main().catch((err) => {
  console.error("Revoke failed:", err.message || err);
  process.exit(1);
});
