# CLI Commands Reference

dawg is primarily a CLI tool. Running `dawg` with no arguments starts the server and opens the web UI. All other functionality is accessed through subcommands.

```
dawg [command] [options]
```

---

## Commands

### `dawg` (default)

Start the server and open the UI.

```bash
dawg
dawg --no-open
dawg --auto-init
```

When run without a subcommand, dawg does the following:

1. Loads global preferences from `~/.dawg/app-preferences.json`
2. Determines the server port (see [Port Selection](#port-selection))
3. If the Electron app is already running, opens the current project as a new tab in the existing window and exits
4. If no `.dawg/config.json` is found:
   - With `--auto-init`: auto-initializes config using detected defaults (start command, install command, base branch)
   - In an interactive terminal: launches the setup wizard (`dawg init`)
   - Non-interactive (e.g., spawned by Electron): proceeds with defaults
5. Starts the Hono HTTP server
6. Writes `server.json` to `.dawg/` for agent discovery (contains the server URL and PID)
7. Opens the UI:
   - If the Electron app is installed, opens it via the `dawg://` protocol
   - If running in dev mode with Electron available, spawns Electron directly
   - If no Electron is found and the terminal is interactive, prompts to install the desktop app (macOS only — downloads and installs the latest DMG from GitHub Releases)
   - If the user declines or the terminal is non-interactive, just prints the server URL

**Options:**

| Option        | Environment Variable | Description                                                         |
| ------------- | -------------------- | ------------------------------------------------------------------- |
| `--no-open`   | `DAWG_NO_OPEN=1`     | Start the server without opening the UI                             |
| `--auto-init` | `DAWG_AUTO_INIT=1`   | Auto-initialize config if none is found (skips interactive prompts) |

On first run, dawg also installs itself into `~/.local/bin/` (as a shell wrapper) so the `dawg` command is available system-wide. If `~/.local/bin` is not in your `PATH`, it will print a warning with instructions.

---

### `dawg init`

Interactive setup wizard to create `.dawg/config.json`.

```bash
dawg init
```

Must be run inside a git repository. Exits with an error if a config file already exists.

The wizard prompts for:

| Prompt            | Default                                              | Description                                      |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------ |
| Project directory | `.` (current directory)                              | Absolute or relative path to the project root    |
| Base branch       | Auto-detected (e.g., `origin/main`)                  | Branch that new worktrees are created from       |
| Dev start command | Auto-detected from `package.json` scripts            | Command to start the dev server in each worktree |
| Install command   | Auto-detected (`pnpm install`, `yarn install`, etc.) | Command to install dependencies in each worktree |

After writing the config, `init` also:

- Creates a `.dawg/.gitignore` with a whitelist approach (ignores everything except `config.json` and `.gitignore`)
- Stages both files with `git add` so they are ready to commit
- Detects environment variable mappings if ports are already configured
- Prints next steps for getting started

The generated config file (`.dawg/config.json`) looks like:

```json
{
  "startCommand": "pnpm dev",
  "installCommand": "pnpm install",
  "baseBranch": "origin/main",
  "ports": {
    "discovered": [],
    "offsetStep": 1
  }
}
```

---

### `dawg add [name]`

Set up an integration.

```bash
dawg add            # Interactive picker
dawg add github     # Set up GitHub directly
dawg add linear     # Set up Linear directly
dawg add jira       # Set up Jira directly
```

Requires an existing config (`dawg init` must have been run first). If no integration name is provided, an interactive picker is shown with the current status of each integration.

#### `dawg add github`

Checks for the GitHub CLI (`gh`) and verifies authentication. Does not store any credentials -- GitHub integration relies entirely on the `gh` CLI being installed and authenticated.

Prerequisites:

- Install `gh`: `brew install gh` (macOS) or see [GitHub CLI docs](https://github.com/cli/cli)
- Authenticate: `gh auth login`

Once set up, enables PR creation, commit, and push from the dawg UI.

#### `dawg add linear`

Connects to Linear for issue tracking.

Prompts for:

- **API Key** -- create one at https://linear.app/settings/account/security/api-keys/new
- **Default team key** (optional, e.g., `ENG`)

Tests the connection before saving. Credentials are stored in `.dawg/integrations.json` (gitignored by default).

#### `dawg add jira`

Connects to Atlassian Jira for issue tracking. Offers two authentication methods:

**OAuth 2.0 (recommended):**

- Requires creating an OAuth app at https://developer.atlassian.com/console
- Prompts for Client ID and Client Secret
- Runs a browser-based OAuth authorization flow
- Auto-discovers the Jira Cloud ID and site URL

**API Token:**

- Simpler setup, no app registration needed
- Create a token at https://id.atlassian.com/manage-profile/security/api-tokens
- Prompts for site URL, email, and API token

Both methods prompt for an optional default project key (e.g., `PROJ`). Credentials are stored in `.dawg/integrations.json`.

---

### `dawg mcp`

Start as an MCP (Model Context Protocol) server for AI coding agents.

```bash
dawg mcp
```

Uses stdio for JSON-RPC communication. All `console.log` output is redirected to stderr because stdout is reserved for JSON-RPC messages.

Operates in one of two modes:

- **Proxy mode**: If a dawg server is already running (detected via `.dawg/server.json`), relays JSON-RPC messages between stdio and the HTTP server's `/mcp` endpoint. This gives the agent shared state with the UI.
- **Standalone mode**: If no server is running, creates its own `WorktreeManager` instance and operates independently.

Typical usage in a Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "dawg": {
      "command": "dawg",
      "args": ["mcp"]
    }
  }
}
```

---

### `dawg task [source] [ID...]`

Create worktrees from issue IDs. Supports Jira, Linear, and local issues.

```bash
dawg task                               # Interactive: pick source, then enter ID
dawg task jira PROJ-123                 # Jira issue
dawg task linear ENG-42                 # Linear issue
dawg task local 7                       # Local issue (LOCAL-7)
dawg task jira PROJ-123 PROJ-456        # Batch mode: multiple IDs from same source
dawg task jira 123                      # Uses default project key from Jira config
```

The first argument is the issue source (`jira`, `linear`, or `local`). If omitted, an interactive prompt asks you to pick a source and enter an ID.

Requires the relevant integration to be connected (`dawg add jira` for Jira, `dawg add linear` for Linear). Local issues don't require an integration.

**Single task mode:** Fetches the issue, prints a summary, saves task data, then prompts for an action (create worktree, link to existing, or just save).

**Batch mode** (multiple IDs): Fetches each issue, auto-creates a worktree for each, and skips interactive prompts. Errors on individual tasks are logged but don't stop the batch.

This command:

1. Resolves the task key (if a bare number is given, prepends the configured default project/team key)
2. Fetches issue details (summary, status, priority, assignee, labels)
3. Prints a summary of the issue
4. Saves task data locally
5. Downloads any attachments (Jira only)
6. In single mode, prompts for an action:
   - **Create a worktree** -- creates a new git worktree with the issue key as the branch name, copies `.env` files, runs the install command
   - **Link to an existing worktree** -- associates the task with a worktree that already exists
   - **Just save the data** -- saves the task data without creating or linking a worktree
7. In batch mode, automatically creates a worktree for each task

---

### `--help`, `-h`

Show the help message with a summary of all commands and options.

```bash
dawg --help
dawg -h
```

Output:

```
dawg -- git worktree manager with automatic port offsetting

Usage: dawg [command] [options]

Commands:
  (default)     Start the server and open the UI
  init          Interactive setup wizard to create .dawg/config.json
  add [name]    Set up an integration (github, linear, jira)
  mcp           Start as an MCP server (for AI coding agents)
  task [source] [ID...] Create worktrees from issues (jira, linear, local)

Options:
  --no-open     Start the server without opening the UI
  --auto-init   Auto-initialize config if none found
  --help, -h    Show this help message
  --version, -v Show version
```

---

### `--version`, `-v`

Show the current version.

```bash
dawg --version
dawg -v
```

---

## Configuration Discovery

When dawg starts, it searches for `.dawg/config.json` by walking up the directory tree from the current working directory:

1. Check `$CWD/.dawg/config.json`
2. Check `$CWD/../.dawg/config.json`
3. Continue up to the filesystem root

Config files found inside worktree directories (paths containing `.dawg/worktrees/`) are skipped. This ensures that when you `cd` into a worktree checkout, dawg still finds the main project's config rather than a config from the worktree's source tree.

Once found, dawg changes the working directory to the project root (the parent of `.dawg/`).

If no config is found, dawg uses defaults:

| Setting            | Default       |
| ------------------ | ------------- |
| `projectDir`       | `.`           |
| `startCommand`     | `""` (empty)  |
| `installCommand`   | `""` (empty)  |
| `baseBranch`       | `origin/main` |
| `ports.discovered` | `[]`          |
| `ports.offsetStep` | `1`           |

---

## Port Selection

The server port is determined by the following priority (highest first):

1. **`DAWG_PORT` environment variable** -- e.g., `DAWG_PORT=7070 dawg`
2. **Global preferences** -- `basePort` in `~/.dawg/app-preferences.json` (configurable through the Electron app or API)
3. **Default** -- `6969`

If the chosen port is already in use, dawg automatically increments and tries the next port until it finds an available one.

---

## Environment Variables

| Variable         | Description                                                                       |
| ---------------- | --------------------------------------------------------------------------------- |
| `DAWG_PORT`      | Override the server port (highest priority)                                       |
| `DAWG_NO_OPEN`   | Set to `1` to start the server without opening the UI (equivalent to `--no-open`) |
| `DAWG_AUTO_INIT` | Set to `1` to auto-initialize config if none found (equivalent to `--auto-init`)  |

---

## Global Preferences

Stored at `~/.dawg/app-preferences.json`. These preferences persist across all projects.

| Key               | Type                          | Default | Description                       |
| ----------------- | ----------------------------- | ------- | --------------------------------- |
| `basePort`        | `number`                      | `6969`  | Default server port               |
| `setupPreference` | `"auto" \| "manual" \| "ask"` | `"ask"` | How to handle missing config      |
| `sidebarWidth`    | `number`                      | `300`   | UI sidebar width in pixels        |
| `windowBounds`    | `object \| null`              | `null`  | Electron window position and size |

---

## File Layout

After initialization, the `.dawg/` directory contains:

```
.dawg/
  config.json          # Project configuration (committed to git)
  .gitignore           # Whitelist gitignore (committed to git)
  server.json          # Running server info (auto-generated, gitignored)
  integrations.json    # Integration credentials (gitignored)
  worktrees/           # Git worktree checkouts
  tasks/               # Jira task data and attachments
  local-issues/        # Local issue storage
```

The global `~/.dawg/` directory contains:

```
~/.dawg/
  app-preferences.json # Global preferences
  electron.lock        # Electron process lock file
```
