const test = require("node:test");
const assert = require("node:assert/strict");
const { enforceSecurityPolicy } = require("../src/config/security");

test("production requires fs access password", () => {
  assert.throws(
    () =>
      enforceSecurityPolicy(
        {
          NODE_ENV: "production",
          ENABLED_CHANNELS: "telegram",
          ALLOWED_IDENTITIES: "telegram:user:1",
          FS_ACCESS_PASSWORD: "",
        },
        new Set(["telegram:user:1"]),
      ),
    /FS_ACCESS_PASSWORD is required in production/i,
  );
});

test("production requires ALLOWED_IDENTITIES for bot-style channels", () => {
  assert.throws(
    () =>
      enforceSecurityPolicy(
        {
          NODE_ENV: "production",
          ENABLED_CHANNELS: "telegram,discord",
          ALLOWED_IDENTITIES: "",
          FS_ACCESS_PASSWORD: "strong-pass",
        },
        new Set(),
      ),
    /ALLOWED_IDENTITIES must be non-empty in production/i,
  );
});

test("production requires TELEGRAM_USER_ALLOWED_PEERS for telegram_user channel", () => {
  assert.throws(
    () =>
      enforceSecurityPolicy(
        {
          NODE_ENV: "production",
          ENABLED_CHANNELS: "telegram_user",
          TELEGRAM_USER_ALLOWED_PEERS: "",
          FS_ACCESS_PASSWORD: "strong-pass",
        },
        new Set(),
      ),
    /TELEGRAM_USER_ALLOWED_PEERS must be non-empty in production/i,
  );
});

test("development allows empty allowlists", () => {
  assert.doesNotThrow(() =>
    enforceSecurityPolicy(
      {
        NODE_ENV: "development",
        ENABLED_CHANNELS: "telegram,telegram_user",
        ALLOWED_IDENTITIES: "",
        TELEGRAM_USER_ALLOWED_PEERS: "",
        FS_ACCESS_PASSWORD: "",
      },
      new Set(),
    ),
  );
});
