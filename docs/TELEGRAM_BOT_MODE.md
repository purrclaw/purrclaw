# Telegram Bot Mode

Use this mode when PurrClaw should reply from a Telegram bot account (Bot API).

## When to use

- You want standard bot behavior.
- You do not need replies from your personal profile.
- You want classic Telegram bot token setup.

## Required environment

```env
ENABLED_CHANNELS=telegram
TELEGRAM_TOKEN=your_bot_token
ALLOWED_IDENTITIES=telegram:user:123456789,telegram:chat:-1001234567890
```

Notes:

- `ALLOWED_IDENTITIES` is optional but strongly recommended.
- If `ALLOWED_IDENTITIES` is empty, bot accepts all chats/users.
- Allowed token format for Telegram:
  - `telegram:user:<user_id>`
  - `telegram:chat:<chat_id>`

## Start

```bash
npm start
```

## Supported commands

- `/start`
- `/help`
- `/reset`
- `/model`
- `/tools`
- `/subagents`
- `/subagent <id>`

## How to get IDs

- User ID: forward a message to `@userinfobot` (or similar ID bot).
- Chat/group ID: use `@RawDataBot` in the target chat.

## Security recommendations

- Always set `ALLOWED_IDENTITIES` in production.
- For groups, whitelist chat ID explicitly.
- Keep `TELEGRAM_TOKEN` in `.env.local` or secure secret storage.
- In `NODE_ENV=production`, process startup is blocked when `ALLOWED_IDENTITIES` is empty.
