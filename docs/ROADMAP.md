# PurrClaw Roadmap 🐾

## Current State

Single-channel Telegram AI agent powered by DeepSeek with agentic tool-calling loop, SQLite persistence, and workspace filesystem tools.

**Stack:** Node.js · DeepSeek API · SQLite (`sqlite3` + `sqlite`) · Telegram Bot API  
**Tools:** read_file, write_file, append_file, list_dir, exec, memory_read, memory_write

---

## Phase 1 — Quick Wins 🟢

> Low complexity, high impact. Ship fast.

- [ ] **Whitelist users** — `ALLOWED_USERS` env var with comma-separated Telegram user IDs. Reject unauthorized users with a polite message.

- [ ] **Parallel tool calls** — Execute multiple tool calls concurrently via `Promise.all` instead of sequential loop. DeepSeek already returns arrays.

- [ ] **memory_list / memory_delete tools** — List all memory keys and delete specific entries. Essential for agent self-management.

- [ ] **Docker + docker-compose** — `Dockerfile` + `docker-compose.yml` for reliable production deploys.

---

## Phase 2 — Core Features 🟡

> Medium complexity, very high user value.

- [ ] **Web search tool** — Integrate Tavily or SerpAPI. Agents need real-time information retrieval. Configure via `SEARCH_API_KEY`.

- [ ] **Streaming responses** — Stream LLM output and edit Telegram message every ~1s. Dramatically better UX vs waiting for full response.

- [ ] **Vision support** — Handle `msg.photo` in Telegram channel. Download image, encode as base64, pass to DeepSeek vision model.

- [ ] **Inline keyboards** — Quick action buttons for confirmations, `/reset` confirm, pagination of long outputs.

- [ ] **Voice messages (STT)** — Transcribe `msg.voice` via Whisper API, process as text.

---

## Phase 3 — Architecture 🔵

> Larger changes, unlock new capabilities.

- [ ] **Multi-provider support** — Abstract `BaseProvider` interface. Add OpenAI, Anthropic, Ollama adapters. Switch via `PROVIDER=openai` env var.

- [ ] **Per-user workspace isolation** — Each user gets their own `workspace/<userId>/` directory instead of shared workspace.

- [ ] **Scheduled tasks / Cron** — Allow agent to register recurring tasks (reminders, daily digests, monitoring scripts).

- [ ] **HTTP/REST channel** — Express.js endpoint alongside Telegram for web widget or n8n/Make.com integration.

---

## Phase 4 — Advanced 🔴

> High complexity, long-term vision.

- [ ] **RAG / Vector search** — Load user documents → embed → semantic search. Candidates: sqlite-vss, Chroma, Qdrant.

- [ ] **Observability** — Log tool calls, latency, token usage to SQLite. Add `/stats` command showing usage per session.

- [ ] **Multi-agent orchestration** — Spawn sub-agents for parallel workloads, aggregate results in parent agent.

- [ ] **Plugin system** — Hot-load custom tools from `workspace/plugins/` directory without restart.

---

## Priority Matrix

| Feature              | Complexity | Impact     | Phase |
|----------------------|-----------|------------|-------|
| Whitelist users      | Low       | 🔴 Critical | 1     |
| Parallel tool calls  | Low       | High        | 1     |
| memory_list/delete   | Low       | Medium      | 1     |
| Docker               | Low       | High        | 1     |
| Web search           | Medium    | Very High   | 2     |
| Streaming            | Medium    | High        | 2     |
| Vision (photos)      | Medium    | High        | 2     |
| Multi-provider       | Medium    | High        | 3     |
| Per-user workspace   | Medium    | Medium      | 3     |
| HTTP channel         | Medium    | High        | 3     |
| RAG                  | High      | Very High   | 4     |
| Observability        | Medium    | Medium      | 4     |
| Plugin system        | High      | High        | 4     |
