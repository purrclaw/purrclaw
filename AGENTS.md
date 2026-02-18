# PurrClaw Project Context

## Overview

Personal AI agent for Telegram with agentic tool-calling loop, SQLite persistence, and filesystem operations.

## Tech Stack

- **Runtime**: Node.js 22
- **LLM Provider**: DeepSeek API
- **Database**: SQLite (better-sqlite3)
- **Channel**: Telegram Bot API
- **Tools**: read_file, write_file, append_file, list_dir, exec, memory_read, memory_write

## Architecture

```
src/
├── index.js              # Bootstrap & startup
├── agent/
│   ├── loop.js           # LLM iteration loop (max 20 iterations)
│   └── context.js        # System prompt builder
├── channels/
│   └── telegram.js       # Bot API, markdown→HTML conversion
├── db/
│   └── database.js       # SQLite: sessions, messages, memory
├── providers/
│   └── deepseek.js       # OpenAI-compatible API client
└── tools/
    ├── registry.js       # Tool registration & execution
    ├── filesystem.js     # read/write/append/list
    ├── shell.js          # exec with safety guards
    └── memory.js         # key-value store

# Note: 'workspace/' folder is for Identity/Personality ONLY. Do not edit logic there.
workspace/
├── AGENT.md          # Agent personality config
├── IDENTITY.md       # Identity settings
└── SOUL.md           # Core behaviors
```

## Key Patterns

### Agent Loop

- Max 20 iterations per request
- Tool calls → execution → continue loop
- No tool calls → final response
- Context compression on token limit errors

### Session Management

- Session key: `telegram:<chatId>`
- History stored in SQLite
- Auto-summarization when >20 messages or 75% context window

### Tool Execution

- Safety guards block: rm -rf, sudo, format, fork bombs
- Output truncated at 10KB
- 60s timeout for shell commands

## Coding Guidelines

- KISS — no over-engineering
- Self-documenting code — no comments needed
- Small functions, single responsibility
- Match existing patterns
- English only

## Anti-Patterns (NEVER DO)

- Global state
- Hardcoded paths (use `path.join`)
- SQL string concatenation (use params)
- Unhandled Promise rejections

## Checklist: Modifying Code

1. Read existing patterns first.
2. Match the style of surrounding code.
3. Keep functions small and focused.
4. Handle errors gracefully.
5. Test via Telegram after changes.

## Environment Files

| File               | Git | Content                    |
| ------------------ | --- | -------------------------- |
| `.env.development` | ✅  | Dev defaults               |
| `.env.production`  | ✅  | Prod defaults              |
| `.env.local`       | ❌  | Secrets (tokens, API keys) |

## Docker

```bash
# Dev (auto-reload)
docker compose up

# Prod
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Current Roadmap

Planned features:

- Phase 1: Whitelist users, parallel tools, memory tools
- Phase 2: Web search, streaming, vision
- Phase 3: Multi-provider, HTTP channel
- Phase 4: RAG, observability
