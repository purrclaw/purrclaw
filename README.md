# PurrClaw 🐾

Minimalist, secure, and local-first AI agent for modern messengers.
Built with Node.js + SQLite + a provider-ready LLM layer.
A practical alternative to heavy agent stacks like openclaw.
Telegram is the current channel, with support for other popular messengers planned.

Inspired by [picoclaw](https://github.com/sipeed/picoclaw).

**Keywords:** openclaw alternative, ai agent, telegram ai agent, minimal ai agent, secure ai agent, nodejs ai agent, sqlite ai memory, tool-calling agent

## Why PurrClaw (vs openclaw-style stacks)

- **Minimal by default** — tiny codebase, no framework bloat
- **Safer execution** — shell safety guards, output limits, and timeouts
- **Predictable state** — SQLite persistence for sessions and memory
- **Fast to hack** — simple architecture, easy to read and modify
- **No over-engineering** — focused, channel-ready agent loop without bloat

## Features

- 🤖 **LLM provider-ready** — currently configured with DeepSeek (`deepseek-chat`), with multi-provider support in roadmap
- 💬 **Messenger channel architecture** — Telegram is implemented today; support for other popular messengers is planned
- 🗄️ **SQLite (`sqlite3` + `sqlite`)** — persistent session history, memory, and state
- 🔧 **Agentic tool-calling** — read/write files, list directories, execute shell commands, persistent memory
- 🧠 **Auto-summarization** — automatically compresses long-running chats to stay within context window
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

## Configuration

Edit `.env`:

```env
TELEGRAM_TOKEN=your_telegram_bot_token
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-chat
WORKSPACE_DIR=./workspace
MAX_ITERATIONS=20
CONTEXT_WINDOW=65536
ALLOWED_IDENTITIES=telegram:user:123456789,telegram:chat:-1001234567890
```

### Security First

Set `ALLOWED_IDENTITIES` in production.
Running with an empty allowlist is for local testing only.

Supported tokens:
- `telegram:user:123456789`
- `telegram:chat:-1001234567890`

## Telegram Commands

Telegram is currently the primary channel. Other popular messengers are planned.

| Command  | Description                |
| -------- | -------------------------- |
| `/start` | Start the bot              |
| `/help`  | Show help message          |
| `/reset` | Clear conversation history |
| `/model` | Show current AI model      |
| `/tools` | List available tools       |

## Available Tools

| Tool           | Description                                |
| -------------- | ------------------------------------------ |
| `read_file`    | Read file contents from workspace          |
| `write_file`   | Write content to a file                    |
| `append_file`  | Append content to a file                   |
| `list_dir`     | List directory contents                    |
| `exec`         | Execute shell commands (with safety guard) |
| `memory_read`  | Read from persistent key-value memory      |
| `memory_write` | Write to persistent key-value memory       |

## Use Cases

- Multi-messenger personal copilot (Telegram now, more channels planned)
- Lightweight self-hosted AI agent without cloud lock-in
- Safe tool-calling experiments on Node.js

## Roadmap

- Whitelist users and access controls
- Parallel tool execution
- Web search, streaming, and vision support
- Multi-provider backend and HTTP channel
- Support for other popular messengers beyond Telegram (WhatsApp, Discord, Slack, and more)

## Project Structure

```
purrclaw/
├── src/
│   ├── index.js              # Entry point
│   ├── agent/
│   │   ├── loop.js           # Main agent loop (LLM + tool calling)
│   │   └── context.js        # System prompt / context builder
│   ├── channels/
│   │   └── telegram.js       # Telegram channel (more messenger channels planned)
│   ├── db/
│   │   └── database.js       # SQLite database layer
│   ├── providers/
│   │   └── deepseek.js       # Current provider adapter (multi-provider planned)
│   └── tools/
│       ├── registry.js       # Tool registry
│       ├── filesystem.js     # File system tools
│       ├── shell.js          # Shell execution tool
│       └── memory.js         # Persistent memory tools
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
