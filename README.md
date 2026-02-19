# PurrClaw 🐾

[![Node.js](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Telegram](https://img.shields.io/badge/Telegram-26A5E4?logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![Discord](https://img.shields.io/badge/Discord-5865F2?logo=discord&logoColor=white)](https://discord.com/developers/docs/intro)
[![Slack](https://img.shields.io/badge/Slack-4A154B?logo=slack&logoColor=white)](https://api.slack.com/)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-25D366?logo=whatsapp&logoColor=white)](https://wwebjs.dev/)
[![DeepSeek](https://img.shields.io/badge/DeepSeek-API-0A0A0A)](https://api-docs.deepseek.com/)
[![OpenAI Compatible](https://img.shields.io/badge/OpenAI-Compatible-412991)](https://platform.openai.com/docs/api-reference)

Minimalist, secure, and local-first AI agent for modern messengers.
Built with Node.js + SQLite + a provider-ready LLM layer.
A practical alternative to heavy agent stacks like openclaw.
Runs with Telegram, Discord, Slack, and WhatsApp channels, and a pluggable provider layer.

Inspired by [picoclaw](https://github.com/sipeed/picoclaw).

**Keywords:** openclaw alternative, ai agent, telegram ai agent, minimal ai agent, secure ai agent, nodejs ai agent, sqlite ai memory, tool-calling agent

## TL;DR

- Use PurrClaw if you want a practical self-hosted agent with tool calling and persistent memory.
- It is optimized for small teams and solo builders who prefer simple Node.js architecture over heavy frameworks.
- Start with Telegram + DeepSeek in minutes, then add providers/channels as needed.

## Why PurrClaw (vs openclaw-style stacks)

- **Minimal by default** — tiny codebase, no framework bloat
- **Safer execution** — shell safety guards, output limits, and timeouts
- **Predictable state** — SQLite persistence for sessions and memory
- **Fast to hack** — simple architecture, easy to read and modify
- **No over-engineering** — focused, channel-ready agent loop without bloat

## Features

- 🤖 **Multi-provider architecture** — `deepseek`, `openai`, and generic `openai_compat` with optional fallback routing
- 💬 **Multi-channel architecture** — `telegram`, `discord`, `slack`, and `whatsapp` via channel manager + env config
- 🗄️ **SQLite (`sqlite3` + `sqlite`)** — persistent session history, memory, and state
- 🔧 **Agentic tool-calling** — read/write files, list directories, execute shell commands, persistent memory
- 🧠 **Auto-summarization** — automatically compresses long-running chats to stay within context window
- ⏱️ **Tool execution guardrails** — per-tool timeout control via `TOOL_TIMEOUT_MS`
- ⏰ **Reminders** — scheduled in-chat reminders with persistence
- 🤝 **Multi-agent v1** — spawn isolated subagents and fetch status/result
- 📁 **Workspace** — customizable workspace with bootstrap files (AGENT.md, SOUL.md, etc.)

## Quick Start

```bash
# Install dependencies
npm install

# Configure (edit .env with your keys)
cp .env.example .env

# Start
npm start
```

## Docker

```bash
# Development (with auto-reload via docker-compose.override.yml)
docker compose up

# Production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Configuration

### Minimal setup (recommended first run)

Start with this small config:

```env
PROVIDER=deepseek
ENABLED_CHANNELS=telegram
TELEGRAM_TOKEN=your_telegram_bot_token
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-chat
ALLOWED_IDENTITIES=telegram:user:123456789
```

### Full example

Use this extended config when enabling more providers/channels/features:

```env
PROVIDER=deepseek
FALLBACK_PROVIDER=openai_compat
ENABLED_CHANNELS=telegram

TELEGRAM_TOKEN=your_telegram_bot_token
DISCORD_TOKEN=your_discord_bot_token
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...

DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-chat

OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1

OPENAI_COMPAT_API_KEY=your_compat_api_key
OPENAI_COMPAT_BASE_URL=https://openrouter.ai/api/v1
OPENAI_COMPAT_MODEL=gpt-4o-mini
FALLBACK_OPENAI_COMPAT_API_KEY=your_fallback_key
FALLBACK_OPENAI_COMPAT_BASE_URL=https://openrouter.ai/api/v1
FALLBACK_OPENAI_COMPAT_MODEL=gpt-4o-mini
BRAVE_SEARCH_API_KEY=your_brave_key_optional

WORKSPACE_DIR=./workspace
MAX_ITERATIONS=20
CONTEXT_WINDOW=65536
STREAMING_RESPONSES=true
TOOL_TIMEOUT_MS=45000
SUBAGENT_MAX_SECONDS=120
SUBAGENT_MAX_CONCURRENT=3
SUBAGENT_RETENTION_HOURS=24
SUBAGENT_CLEANUP_INTERVAL_MS=600000
DISCORD_REQUIRE_MENTION=true
SLACK_REQUIRE_MENTION=true
WHATSAPP_REQUIRE_PREFIX=@bot
WHATSAPP_CLIENT_ID=purrclaw
ALLOWED_IDENTITIES=telegram:user:123456789,telegram:chat:-1001234567890,discord:user:123456789012345678,discord:guild:123456789012345678,slack:user:U12345678,slack:channel:C12345678,slack:team:T12345678,whatsapp:contact:1234567890@c.us,whatsapp:chat:1234567890@c.us
```

### Security First

Set `ALLOWED_IDENTITIES` in production.
Running with an empty allowlist is for local testing only.

Supported tokens:
- `telegram:user:123456789`
- `telegram:chat:-1001234567890`
- `discord:user:123456789012345678`
- `discord:channel:123456789012345678`
- `discord:guild:123456789012345678`
- `slack:user:U12345678`
- `slack:channel:C12345678`
- `slack:team:T12345678`
- `whatsapp:contact:1234567890@c.us`
- `whatsapp:chat:1234567890@c.us`

## Commands

Shared bot commands (`/start`, `/help`, `/reset`, `/model`, `/tools`) are supported in Telegram, Discord, Slack, and WhatsApp.

| Command  | Description                |
| -------- | -------------------------- |
| `/start` | Start the bot              |
| `/help`  | Show help message          |
| `/reset` | Clear conversation history |
| `/model` | Show current AI model      |
| `/tools` | List available tools       |
| `/subagents` | List subagents in current session |
| `/subagent <id>` | Show status/result for one subagent |

## Available Tools

| Tool | Description |
| ---- | ----------- |
| `read_file` | Read file contents from workspace |
| `write_file` | Write content to a file |
| `append_file` | Append content to a file |
| `list_dir` | List directory contents |
| `exec` | Execute shell commands (with safety guard) |
| `memory_read` | Read from persistent key-value memory |
| `memory_write` | Write to persistent key-value memory |
| `memory_list` | List memory keys and latest values |
| `memory_delete` | Delete memory entry by key |
| `web_search` | Search web (Brave if key set, else DDG) |
| `read_url` | Fetch and extract text from a URL |
| `workspace_search` | Find relevant lines across workspace files |
| `reminder_create` | Set reminder in N seconds |
| `reminder_list` | List pending reminders |
| `reminder_delete` | Delete reminder by ID |
| `spawn_subagent` | Launch async subagent task |
| `subagent_status` | Check subagent status by ID |
| `subagent_result` | Read subagent final result |
| `subagent_list` | List recent subagents for current session |

## Use Cases

- Multi-messenger personal copilot (Telegram + Discord + Slack + WhatsApp today)
- Lightweight self-hosted AI agent without cloud lock-in
- Safe tool-calling experiments on Node.js

## Roadmap

- Vision and voice input support
- More channels and richer attachment handling
- Provider routing and smarter model selection

## Project Structure

```
purrclaw/
├── src/
│   ├── index.js              # Entry point
│   ├── agent/
│   │   ├── loop.js           # Main agent loop (LLM + tool calling)
│   │   └── context.js        # System prompt / context builder
│   ├── channels/
│   │   ├── factory.js        # Channel factory from env
│   │   ├── manager.js        # Multi-channel lifecycle manager
│   │   ├── telegram.js       # Telegram channel
│   │   ├── discord.js        # Discord channel
│   │   ├── slack.js          # Slack channel (Socket Mode)
│   │   └── whatsapp.js       # WhatsApp channel
│   ├── db/
│   │   └── database.js       # SQLite database layer
│   ├── providers/
│   │   ├── factory.js        # Provider factory from env
│   │   ├── openai_compat.js  # OpenAI-compatible base provider
│   │   ├── deepseek.js       # DeepSeek provider adapter
│   │   └── fallback.js       # Fallback provider wrapper
│   ├── reminders/
│   │   └── service.js        # Scheduled reminder engine
│   ├── subagents/
│   │   └── service.js        # Subagent orchestration service
│   └── tools/
│       ├── registry.js       # Tool registry
│       ├── filesystem.js     # File system tools
│       ├── shell.js          # Shell execution tool
│       ├── memory.js         # Persistent memory tools
│       ├── web.js            # Web search tool
│       ├── fetch.js          # Read URL tool
│       ├── workspace_search.js # RAG-lite workspace search
│       ├── reminder.js       # Reminder tools
│       └── subagent.js       # Subagent tools
├── workspace/
│   ├── AGENT.md              # Agent instructions
│   ├── IDENTITY.md           # Agent identity
│   └── SOUL.md               # Agent personality
├── .env                      # Environment variables
└── package.json
```

## Positioning

If you want an AI agent that is **smaller, safer, and easier to run** than typical openclaw-style setups, PurrClaw is built for that.

## License

MIT
