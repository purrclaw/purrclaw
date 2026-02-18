# PurrClaw Project Context for Gemini

## What is PurrClaw?

A lightweight personal AI agent for Telegram powered by DeepSeek. It features an agentic loop with tool-calling capabilities, SQLite persistence, and workspace filesystem tools.

## Tech Stack

- **Runtime**: Node.js 22
- **LLM Provider**: DeepSeek API
- **Database**: SQLite (better-sqlite3)
- **Channel**: Telegram Bot API
- **Tools**: read_file, write_file, append_file, list_dir, exec, memory_read, memory_write

## Project Structure

```
src/
├── index.js          # Entry point, bootstrap
├── agent/
│   ├── loop.js       # Core agentic loop with tool-calling
│   └── context.js    # System prompt builder
├── channels/
│   └── telegram.js   # Telegram bot integration
├── db/
│   └── database.js   # SQLite operations
├── providers/
│   └── deepseek.js   # DeepSeek API client
└── tools/
    ├── registry.js   # Tool registry & execution
    ├── filesystem.js # File operations
    ├── shell.js      # Command execution with safety guards
    └── memory.js     # Key-value persistent memory
workspace/            # Pure Identity & Personality (No code/logic)
├── AGENT.md          # Agent personality config
├── IDENTITY.md       # Identity settings
└── SOUL.md           # Core behaviors
```

## Code Style

- KISS principle
- No comments, self-documenting code
- English only in code
- Small, focused functions
- Avoid over-engineering

## Anti-Patterns

- Global state
- Hardcoded paths (use `path.join`)
- SQL string concatenation (use params)
- Unhandled Promise rejections

## Environment Files

| File               | Purpose                     |
| ------------------ | --------------------------- |
| `.env.development` | Dev defaults (git-tracked)  |
| `.env.production`  | Prod defaults (git-tracked) |
| `.env.local`       | Secrets only (gitignored)   |

## Docker Commands

```bash
# Development (hot-reload)
docker compose up

# Production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## When Modifying Code

1. Read existing patterns first
2. Match the style of surrounding code
3. Keep functions small and focused
4. Handle errors gracefully
5. Test via Telegram after changes
