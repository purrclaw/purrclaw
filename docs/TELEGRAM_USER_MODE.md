# Telegram User Mode

Use this mode when PurrClaw must reply from your personal Telegram account (MTProto), not from a bot account.

## When to use

- You want answers to be sent from your own profile.
- You need one-time authorization with persistent session storage.
- You need a revoke flow to invalidate the session.

## Required environment

```env
ENABLED_CHANNELS=telegram_user
TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=your_api_hash
FS_ACCESS_PASSWORD=123123123
TELEGRAM_USER_ALLOWED_PEERS=@trusted_user,123456789
TELEGRAM_USER_IGNORE_BOT_SENDERS=true
```

Notes:

- `TELEGRAM_USER_ALLOWED_PEERS` is optional.
- If empty, replies are allowed for all incoming peers.
- You can use usernames (`@name`) and/or numeric IDs.
- `FS_ACCESS_PASSWORD` is required for filesystem tools (`read_file`, `write_file`, `append_file`, `list_dir`, `exec`, `workspace_search`).
- `TELEGRAM_USER_IGNORE_BOT_SENDERS=true` (default) prevents loops with bot accounts when `telegram` and `telegram_user` run together.
- `TELEGRAM_USER_PROFILE_HINT` forces a fixed profile for `telegram_user` (example: `telegram_user_@username`).
- `TELEGRAM_PROFILE_HINT` can be set on the `telegram` bot channel to emulate a `telegram_user_@username` profile in bot chat for solo testing.
- `TELEGRAM_USER_BOT_LOOP_DELAY_MS` adds delay between bot-to-bot turns when loop mode is enabled.
- `TELEGRAM_USER_BOT_LOOP_MAX_TURNS` limits loop length per chat (use `/loop_reset` to continue).
- `TELEGRAM_USER_TYPING_INDICATOR=true` enables typing indicator while generating responses.

## One-time authorization

1. Create API credentials at `https://my.telegram.org`.
2. Set `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` in `.env.local`.
3. Run:

```bash
npm run telegram:user:login
```

4. Enter phone number, login code, and 2FA password (if enabled).

After success, session is saved in SQLite under key `telegram:user_session`.

## Start

```bash
npm start
```

## Runtime behavior

- Incoming message from allowed peer -> processed by `AgentLoop` -> reply sent from your account.
- Outgoing `/reset` (sent by you) clears all known session scopes for this chat (`legacy`, `fallback`, `self profile`, `sender profile`).
- `/revoke_session` is accepted only from the owner account of the active `telegram_user` session.
- Any `/revoke_session` sent by non-owner accounts is ignored.
- Outgoing `/loop_reset` (sent by you) clears loop guard counters for that chat.
- Filesystem tools execute only when password is present in the same user message.
- Profile auto-detection order for identity files:
  - `workspace/profiles/<forced hint>/` when `TELEGRAM_USER_PROFILE_HINT` is set
  - `workspace/profiles/telegram_user_@<self_username>/`
  - `workspace/profiles/telegram_user_@<sender_username>/`
  - `workspace/profiles/telegram_user/`
  - `workspace/profiles/default/`
  - `workspace/`

## Revoke session

Two ways:

1. In Telegram chat, send `/revoke_session` from your account.
2. In terminal:

```bash
npm run telegram:user:revoke
```

Both options remove local saved session. CLI revoke also tries server-side logout.

## Security recommendations

- Keep `TELEGRAM_USER_ALLOWED_PEERS` non-empty in production.
- Prefer numeric IDs for stable access control (usernames can change).
- Keep API credentials and session values only in `.env.local` or secure secret storage.
- Outgoing messages are sanitized to reduce accidental secret leakage.
- Reserved memory key `telegram:user_session` is protected from `memory_read` / `memory_list` / `memory_delete`.
- In `NODE_ENV=production`, process startup is blocked when:
  - `TELEGRAM_USER_ALLOWED_PEERS` is empty for `telegram_user` mode
  - `FS_ACCESS_PASSWORD` is empty
