# Architecture Roadmap

## Server as Hub

The dawg server is the central hub. All clients (UI, CLI subcommands, MCP agents, Electron app) connect to it via HTTP/WebSocket. The server owns the single `WorktreeManager` instance and all state.

### Current State

- `dawg` starts the Hono HTTP server, serves the React UI, and exposes REST + SSE + WebSocket APIs
- `dawg mcp` starts a **separate** stdio process with its own `WorktreeManager` (no shared state)
- `server.json` is written to `.dawg/` on startup with the server URL and PID

### Target State

- `/mcp` endpoint on the HTTP server provides MCP via Streamable HTTP transport (done)
- MCP setup writes `{ "url": "http://localhost:PORT/mcp" }` instead of `{ "command": "dawg", "args": ["mcp"] }` (done)
- All MCP clients share state with the UI (same `WorktreeManager`)
- `dawg mcp` (stdio) remains as a fallback for environments that don't support HTTP transport

## Both Entry Points

### CLI-first (current)

```
npm install -g dawg   # or brew install dawg
cd my-project
dawg init             # creates .dawg/config.json
dawg                  # starts server + opens browser
```

### App-first (future)

```
# User downloads Electron app (or installs via brew cask)
# App opens, user picks a project directory
# App calls dawg init internally, starts embedded server
# App installs CLI to PATH for terminal usage
```

Both entry points converge on the same server. The Electron app embeds the server; the CLI starts it as a daemon. Either way, `server.json` advertises the running instance.

## CLI Commands as Thin HTTP Clients

Future CLI subcommands should be thin clients that talk to the running server:

- `dawg list` — `GET /api/worktrees` and print table
- `dawg task PROJ-123` — `POST /api/worktrees/from-jira` and print result
- `dawg connect jira` — `POST /api/integrations/jira/...` (or open browser for OAuth)
- `dawg status` — `GET /api/integrations/verify` and print connection status

If the server isn't running, the CLI should either:

1. Auto-start it in the background (write PID to `server.json`)
2. Error with a helpful message ("run `dawg` first")

## `server.json` as Discovery

All clients find the server via `.dawg/server.json`:

```json
{
  "url": "http://localhost:6969",
  "pid": 12345
}
```

- CLI commands read this to know where to send HTTP requests
- MCP config points to `${url}/mcp`
- Electron app checks if a server is already running before starting its own
- Stale entries (dead PID) are detected and cleaned up

## Installation Flow

```
                    +-------------------+
                    |  npm install -g   |
                    |  dawg             |
                    +---------+---------+
                              |
                    +---------v---------+
                    |  CLI available    |
                    |  in PATH          |
                    +---------+---------+
                              |
              +---------------+---------------+
              |                               |
    +---------v---------+           +---------v---------+
    |  dawg init        |           |  dawg             |
    |  (setup project)  |           |  (start server)   |
    +-------------------+           +---------+---------+
                                              |
                                    +---------v---------+
                                    |  server.json      |
                                    |  written           |
                                    +---------+---------+
                                              |
                          +-------------------+-------------------+
                          |                   |                   |
                +---------v------+  +---------v------+  +---------v------+
                |  Browser UI    |  |  MCP clients   |  |  CLI commands  |
                |  (React SPA)   |  |  (Claude, etc) |  |  (dawg list)   |
                +----------------+  +----------------+  +----------------+
```
