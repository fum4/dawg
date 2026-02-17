# dawg

A CLI tool and desktop UI for managing multiple git worktrees with automatic port offsetting, issue tracker integration, and AI agent support. It solves the fundamental problem of running multiple dev server instances concurrently — when your app binds ports 3000 and 3001, a second copy can't start without conflicts. dawg transparently offsets all known ports per worktree by monkey-patching Node.js `net.Server.listen` and `net.Socket.connect` at runtime.

Beyond port management, dawg provides a full development workflow: create worktrees from Jira or Linear issues, track progress with todos, run hooks (automated checks and agent skills), and integrate with AI coding agents via MCP (Model Context Protocol).

## Quick Start

```bash
# In your project directory
cd /path/to/your/project
dawg init    # interactive setup — discovers ports, configures commands
dawg         # start the server and open the UI
```

In the UI:

1. Click **Discover Ports** to auto-detect all ports your dev command binds
2. Create worktrees from branches or issue tracker tickets
3. Start them — ports are offset automatically, no conflicts

## How Port Offsetting Works

```
Main repo:    api:3000, web:3001  (no offset)
Worktree 1:   api:3010, web:3011  (offset 1 × step 10)
Worktree 2:   api:3020, web:3021  (offset 2 × step 10)
```

A pure CommonJS hook (`port-hook.cjs`) is injected via `NODE_OPTIONS=--require` into all spawned processes. It intercepts `listen()` and `connect()` calls, offsetting known ports. Since `NODE_OPTIONS` propagates to child processes, the entire process tree (turborepo, yarn, tsx, vite, etc.) is covered.

See [Port Mapping](docs/PORT-MAPPING.md) for the full technical details.

## Features

### Worktree Management

Create, start, stop, and remove git worktrees from the UI or CLI. Each worktree gets its own port offset, environment variables, and process lifecycle.

### Issue Tracker Integration

Connect to **Jira** (OAuth or API token), **Linear** (API key), or create **local issues**. Create worktrees directly from tickets — dawg fetches issue details, generates a TASK.md with context, and sets up the branch.

See [Integrations](docs/INTEGRATIONS.md) for setup details.

### AI Agent Support (MCP)

dawg exposes 20+ tools via MCP (Model Context Protocol) that any AI coding agent can use — browse issues, create worktrees, manage todos, commit/push/PR, run hooks. Agents get a structured workflow: pick an issue, create a worktree, read TASK.md, work through todos, run hooks, and ship.

See [MCP](docs/MCP.md) for the tool reference and [Agents](docs/AGENTS.md) for the agent tooling system.

### Activity Feed & Notifications

Real-time activity feed tracks everything happening across your projects — agent actions (commits, pushes, PRs), worktree lifecycle events, hook results, and more. A bell icon in the header shows unread events with category filtering. Important events trigger toast notifications in the UI, and in the Electron app, native OS notifications fire when the window is unfocused.

Agents can send free-form progress updates via the `notify` MCP tool. Other tool calls (`commit`, `push`, `create_pr`, `run_hooks`) are tracked automatically.

See [Notifications](docs/NOTIFICATIONS.md) for the full architecture, event types, and configuration.

### Hooks

Automated checks and agent skills organized by trigger type (pre-implementation, post-implementation, custom, on-demand). Add shell command steps and import skills from the registry. Run from the UI or via MCP tools.

See [Hooks](docs/HOOKS.md) for configuration and usage.

### Electron Desktop App

Optional native app with multi-project tab support, `dawg://` deep linking, native OS notifications, and window state persistence.

See [Electron](docs/ELECTRON.md) for details.

## CLI Commands

| Command                      | Description                                        |
| ---------------------------- | -------------------------------------------------- |
| `dawg`                       | Start the server and open the UI                   |
| `dawg init`                  | Interactive setup wizard                           |
| `dawg add [name]`            | Set up an integration (github, linear, jira)       |
| `dawg mcp`                   | Start as an MCP server for AI agents               |
| `dawg task [source] [ID...]` | Create worktrees from issues (jira, linear, local) |
| `dawg connect`               | Connect to an existing dawg server                 |

See [CLI Reference](docs/CLI.md) for full details.

## Configuration

dawg stores its configuration in `.dawg/config.json` at the project root. Key settings include start/install commands, discovered ports, offset step, environment variable mappings, and integration credentials.

See [Configuration](docs/CONFIGURATION.md) for the complete reference.

## Documentation

| Document                               | Description                                           |
| -------------------------------------- | ----------------------------------------------------- |
| [Architecture](docs/ARCHITECTURE.md)   | System layers, components, data flow, build system    |
| [CLI Reference](docs/CLI.md)           | All CLI commands and options                          |
| [Configuration](docs/CONFIGURATION.md) | Config files, settings, and data storage              |
| [API Reference](docs/API.md)           | REST API endpoints                                    |
| [MCP Tools](docs/MCP.md)               | Model Context Protocol integration and tool reference |
| [Agents](docs/AGENTS.md)               | Agent tooling system, skills, plugins, git policy     |
| [Integrations](docs/INTEGRATIONS.md)   | Jira, Linear, and GitHub setup                        |
| [Port Mapping](docs/PORT-MAPPING.md)   | Port discovery, offset algorithm, runtime hook        |
| [Hooks](docs/HOOKS.md)                 | Hooks system (trigger types, commands, skills)        |
| [Electron](docs/ELECTRON.md)           | Desktop app, deep linking, multi-project              |
| [Frontend](docs/FRONTEND.md)           | React UI architecture, theme, components              |
| [Development](docs/DEVELOPMENT.md)     | Developer guide, build commands, conventions          |
| [Notifications](docs/NOTIFICATIONS.md) | Activity feed, toasts, OS notifications, event types  |
| [Setup Flow](docs/SETUP-FLOW.md)       | Project setup wizard, state machine, integrations     |

## Website

The landing page lives in `/website`, built with [Astro](https://astro.build/). It's a static site with download links (auto-detecting Apple Silicon vs Intel), feature overview, and install instructions.

```bash
cd website
pnpm install
pnpm dev      # Dev server
pnpm build    # Static build → website/dist/
```

## Platform Constraints

- **Unix/macOS only** — depends on `lsof` for port discovery and process group signals
- **Node.js processes only** — the `--require` hook doesn't work with non-Node runtimes
- **GitHub integration** requires `gh` CLI installed and authenticated
- **Jira integration** requires OAuth setup via the Integrations panel
