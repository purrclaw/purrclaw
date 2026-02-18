# PurrClaw 🐾

Ultra-lightweight personal AI agent built with Node.js, SQLite, and DeepSeek.

Inspired by [picoclaw](https://github.com/sipeed/picoclaw).

## Features

- 🤖 **DeepSeek AI** — powered by `deepseek-chat` model with full tool-calling support
- 💬 **Telegram** — long-polling bot with "Thinking..." placeholder and HTML formatting
- 🗄️ **SQLite** — persistent session history, memory, and state via `better-sqlite3`
- 🔧 **Tools** — read/write files, list directories, execute shell commands, persistent memory
- 🧠 **Auto-summarization** — automatically compresses long conversations to stay within context window
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
```

## Telegram Commands

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

## Project Structure

```
purrclaw/
├── src/
│   ├── index.js              # Entry point
│   ├── agent/
│   │   ├── loop.js           # Main agent loop (LLM + tool calling)
│   │   └── context.js        # System prompt / context builder
│   ├── channels/
│   │   └── telegram.js       # Telegram bot channel
│   ├── db/
│   │   └── database.js       # SQLite database layer
│   ├── providers/
│   │   └── deepseek.js       # DeepSeek API provider
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

## License

MIT
