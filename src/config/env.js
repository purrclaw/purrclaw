const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

function isNonEmpty(value) {
  return String(value ?? "").trim() !== "";
}

function loadEnv() {
  const nodeEnv = process.env.NODE_ENV || "development";
  const projectRoot = path.resolve(__dirname, "..", "..");
  const files = [".env", `.env.${nodeEnv}`, ".env.local"];

  const lockedKeys = new Set(
    Object.entries(process.env)
      .filter(([, value]) => isNonEmpty(value))
      .map(([key]) => key),
  );

  for (const file of files) {
    const fullPath = path.join(projectRoot, file);
    if (!fs.existsSync(fullPath)) continue;

    const parsed = dotenv.parse(fs.readFileSync(fullPath));
    for (const [key, value] of Object.entries(parsed)) {
      if (!isNonEmpty(value)) continue;
      if (lockedKeys.has(key)) continue;
      process.env[key] = value;
    }
  }
}

module.exports = { loadEnv };
