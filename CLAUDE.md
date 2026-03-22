# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Agent is a desktop application built with Tauri (Rust backend) and Vue 3 (TypeScript frontend). It provides a unified interface for managing Claude Agent sessions with support for multiple AI providers (Claude, OpenAI, Gemini) and MCP (Model Context Protocol) tools.

## Architecture

### Monorepo Structure

The project uses Bun workspaces with three main areas:

- **apps/desktop**: Vue 3 + Tauri desktop application
- **packages/shared**: Shared TypeScript types and constants used across frontend and sidecar
- **sidecar**: Node.js HTTP server (compiled to binary) that manages Claude Agent sessions

### Key Design Pattern: Session-Centric Sidecar Management

Each chat session gets its own independent Sidecar process:

1. **Frontend (Vue 3)** → Sends requests to Tauri backend
2. **Tauri Backend (Rust)** → SidecarManager spawns/manages Sidecar processes per session
3. **Sidecar (Node.js/Bun)** → HTTP server that:
   - Manages individual Agent sessions using Claude Agent SDK
   - Handles streaming responses and tool calls
   - Proxies requests to different AI providers (OpenAI, Gemini)
   - Persists conversation history

### Frontend State Management

Pinia stores in `apps/desktop/src/stores/`:

- **configStore**: App settings, API keys, provider configs, theme
- **chatStore**: Active conversations, session list, message history
- **skillStore**: Custom skills/prompts that inject into system prompts
- **mcpStore**: MCP server configurations and available tools
- **workspaceStore**: Current workspace path and settings

### Sidecar Architecture

`sidecar/src/` structure:

- **index.ts**: HTTP server entry point with route handlers for `/api/chat/*`, `/api/session/*`, `/api/skill/*`
- **agent/client.ts**: AgentSession wrapper around Claude Agent SDK, handles streaming and tool execution
- **agent/session.ts**: SessionManager for persistence (loads/saves conversations to `~/.aiagent/`)
- **agent/prompt.ts**: System prompt builder that injects skills and context
- **adapters/**: Provider-specific adapters (OpenAI, Gemini) that translate requests to their APIs
- **adapters/registry.ts**: Routes proxy requests to appropriate provider adapter

### Tauri Backend (Rust)

`apps/desktop/src-tauri/src/`:

- **sidecar.rs**: SidecarManager that spawns/kills Sidecar processes, tracks ownership (Tab, CronTask, Agent, Background)
- **config.rs**: ConfigManager for reading/writing app config and conversation persistence
- **sse_proxy.rs**: SSE (Server-Sent Events) proxy for streaming responses
- **lib.rs**: Tauri command registration and app initialization

## Common Commands

### Development

```bash
# Install dependencies
bun install

# Run desktop app with hot reload
bun run dev

# Run Tauri in dev mode (opens window)
bun run tauri:dev

# Run sidecar in watch mode
bun run sidecar:dev
```

### Building

```bash
# Build desktop app
bun run build

# Build Tauri app (creates installer)
bun run tauri:build

# Build sidecar binary
bun run sidecar:build
```

### Testing

```bash
# Run sidecar tests
cd sidecar && bun test
```

## Key Implementation Details

### Port Allocation

Sidecar processes are assigned ports starting from 31415 (configurable in app config), incrementing for each new session. The Tauri backend tracks which port belongs to which session.

### Provider Adapter Pattern

The sidecar supports multiple AI providers through adapters:

- Requests to `/api/chat/stream` with `X-Target-Provider` header are routed to the appropriate adapter
- Each adapter translates the request format and handles provider-specific features
- Adapters are in `sidecar/src/adapters/` and registered in `registry.ts`

### Conversation Persistence

- Conversations are stored in `~/.aiagent/sessions/` as JSON files
- SessionManager loads/saves on demand
- Frontend syncs with backend through `/api/session/list` and `/api/session/load` endpoints

### System Prompt Injection

The sidecar builds system prompts dynamically:

1. Base system prompt from `agent/prompt.ts`
2. Inject active skills from frontend (via `currentSkillPrompt`)
3. Inject MCP tool definitions
4. Pass to Claude Agent SDK

## Important Notes

- **API Keys**: Stored in app config (`~/.aiagent/config.json`), never committed to repo
- **Workspace Path**: Passed to sidecar for context-aware operations
- **Streaming**: Frontend uses EventSource for SSE streams from sidecar
- **CORS**: Sidecar allows cross-origin requests from desktop app
- **Tool Execution**: Claude Agent SDK handles tool calls; adapters may need custom tool implementations
