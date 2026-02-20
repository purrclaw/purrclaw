const path = require("node:path");
const { loadEnv } = require("../config/env");
const { initDb } = require("../db/database");
const { startAdminServer } = require("./backend/server");

loadEnv();

const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || "./workspace");
const DB_PATH = path.join(WORKSPACE_DIR, "data", "purrclaw.db");
const ADMIN_PORT = Number(process.env.ADMIN_PORT || 3010);

async function main() {
  console.log("🐾 PurrClaw admin starting...");
  console.log(`   Workspace: ${WORKSPACE_DIR}`);
  console.log(`   Database:  ${DB_PATH}`);

  await initDb(DB_PATH);
  console.log("✅ Database initialized");

  startAdminServer(ADMIN_PORT);
}

main().catch((err) => {
  console.error("❌ Admin startup failed:", err.message || err);
  process.exit(1);
});
