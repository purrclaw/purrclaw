# PurrClaw Project Context

## Overview

Personal AI agent for Telegram with agentic tool-calling loop, SQLite persistence, and filesystem operations.

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

## Environment

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

## Coding Guidelines

- KISS — no over-engineering
- Self-documenting code — no comments needed
- Small functions, single responsibility
- Match existing patterns
- English only

## Current Roadmap

Planned features:

- Phase 1: Whitelist users, parallel tools, memory tools
- Phase 2: Web search, streaming, vision
- Phase 3: Multi-provider, HTTP channel
- Phase 4: RAG, observability
