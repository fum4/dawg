# Hooks

## Overview

Hooks are automated checks and agent skills that run at defined points in a worktree's lifecycle. They provide a structured way to validate work, enforce quality standards, and extend agent behavior through shell commands and imported skills.

Hooks are organized by **trigger type** -- when they fire relative to agent work. Each trigger type can contain both **command steps** (shell commands) and **skill references** (agent skills from the registry).

The hooks system is configured through the web UI's Hooks view and stored in `.dawg/.dawg/hooks.json`.

## Trigger Types

Every hook belongs to one of four trigger types:

| Trigger               | Description                                                      | Icon              | Color       |
| --------------------- | ---------------------------------------------------------------- | ----------------- | ----------- |
| `pre-implementation`  | Runs before agents start working on a task                       | ListChecks        | sky-400     |
| `post-implementation` | Runs after agents finish implementing a task                     | CircleCheck       | emerald-400 |
| `custom`              | Agent decides when to run, based on a natural-language condition | MessageSquareText | violet-400  |
| `on-demand`           | Manually triggered from the worktree detail panel                | Hand              | amber-400   |

Steps and skills default to `post-implementation` if no trigger is specified.

## Item Types

### Command Steps

Shell commands that run in the worktree directory and return pass/fail results.

- Executed via `execFile` with a 2-minute timeout.
- Pass/fail determined by exit code (zero = pass, non-zero = fail).
- stdout and stderr are captured and returned as step output.
- `FORCE_COLOR=0` is set to suppress ANSI codes in output.
- When running all hooks for a worktree, enabled steps matching the trigger run in parallel.

### Skill References

References to skills from the `~/.dawg/skills/` registry. When hooks run, skill references tell the agent which skills to invoke.

- Skills are imported by name from the registry.
- Each skill reference can be individually enabled/disabled.
- The same skill can be used in multiple trigger types (e.g., a code-review skill in both `post-implementation` and `on-demand`).
- Skills are identified by the composite key `skillName + trigger`.
- Custom-trigger skills include a `condition` field -- a natural-language description of when the agent should invoke them.

### Per-Issue Skill Overrides

Individual issues can override the global enable/disable state of skills. Overrides are stored in the issue's notes (`hookSkills` field) and can be:

| Override  | Behavior                                        |
| --------- | ----------------------------------------------- |
| `inherit` | Use the global enabled/disabled state (default) |
| `enable`  | Force-enable for this issue's worktree          |
| `disable` | Force-disable for this issue's worktree         |

The `getEffectiveSkills()` method resolves overrides by looking up the worktree's linked issue.

## Configuration

Hooks configuration is stored in `.dawg/.dawg/hooks.json`:

```json
{
  "steps": [
    {
      "id": "step-1234567890-1",
      "name": "Type check",
      "command": "pnpm check-types",
      "enabled": true,
      "trigger": "post-implementation"
    },
    {
      "id": "step-1234567890-2",
      "name": "Lint on DB changes",
      "command": "pnpm check-lint",
      "enabled": true,
      "trigger": "custom",
      "condition": "When changes touch database models or migrations"
    }
  ],
  "skills": [
    {
      "skillName": "review-changes",
      "enabled": true,
      "trigger": "post-implementation"
    },
    {
      "skillName": "review-changes",
      "enabled": true,
      "trigger": "on-demand"
    },
    {
      "skillName": "verify-tests",
      "enabled": true,
      "trigger": "custom",
      "condition": "When changes add new API endpoints"
    }
  ]
}
```

### HookStep Fields

| Field       | Type        | Description                                                      |
| ----------- | ----------- | ---------------------------------------------------------------- |
| `id`        | string      | Unique identifier (auto-generated: `step-{timestamp}-{counter}`) |
| `name`      | string      | Human-readable name shown in the UI                              |
| `command`   | string      | Shell command to execute in the worktree directory               |
| `enabled`   | boolean     | Whether this step is active (default: `true`)                    |
| `trigger`   | HookTrigger | When this step runs (default: `post-implementation`)             |
| `condition` | string      | Natural-language condition for `custom` trigger type             |

### HookSkillRef Fields

| Field       | Type        | Description                                           |
| ----------- | ----------- | ----------------------------------------------------- |
| `skillName` | string      | Name of the skill in `~/.dawg/skills/`                |
| `enabled`   | boolean     | Whether this skill is active                          |
| `trigger`   | HookTrigger | When this skill runs (default: `post-implementation`) |
| `condition` | string      | Natural-language condition for `custom` trigger type  |

## Running Hooks

### From the UI

The Hooks view (top navigation) is the configuration interface. Users can:

1. Add command steps or import skills into any trigger type section.
2. Toggle individual items on/off.
3. Edit command step names, commands, and conditions.
4. Remove items.

The worktree detail panel's **Hooks** tab triggers hook runs for a specific worktree. Multiple items can be expanded simultaneously to view their output. When the entire pipeline completes (all enabled steps and skills have results), all items with content are auto-expanded.

Each hook item shows its state visually:

- **Not yet run** -- dashed border, no background.
- **Running** -- solid border, circular progress spinner (Loader2) in the status icon position.
- **Completed** -- solid border with card background, showing pass/fail status icon (CheckCircle/XCircle).
- **Disabled** -- solid border with card background, reduced opacity.

Real-time updates: When agents report hook results via `report_hook_status`, the backend emits a `hook-update` SSE event. The frontend auto-refetches results and auto-expands skills that just received new content.

### From MCP Tools

Agents interact with hooks through the following workflow:

1. Call `get_hooks_config` immediately after entering a worktree to discover all trigger types.
2. Run `pre-implementation` hooks before starting work (command steps via `run_hooks`, skills invoked directly).
3. While working, check `custom` hook conditions — if changes match a condition, run those hooks.
4. Run `post-implementation` hooks after completing work.
5. Report skill results back via `report_hook_status` (call twice: once before invoking without `success`/`summary` to show loading, once after with the result). For skills with detailed output, write an MD file to `{worktreePath}/.dawg-{skillName}.md` and pass the path via `filePath`.
6. Call `get_hooks_status` to verify all steps passed.
7. After all work and hooks are done, ask the user if they'd like to start the worktree dev server automatically (via `start_worktree`).

### Execution

When hooks are triggered for a worktree:

1. The `HooksManager` filters steps by the target trigger type and enabled state.
2. All matching command steps run in parallel via `execFile` in the worktree directory.
3. Results are collected and persisted to `.dawg/.dawg/worktrees/{worktreeId}/hooks/latest-run.json`.
4. Skill results are reported separately by agents and stored at `.dawg/.dawg/worktrees/{worktreeId}/hooks/skill-results.json`.

## Data Storage

```
.dawg/
  .dawg/
    hooks.json                              # Global hooks configuration
    worktrees/
      <worktreeId>/
        hooks/
          latest-run.json                   # Most recent command step run
          skill-results.json                # Agent-reported skill results
```

## REST API

| Method   | Path                                     | Description                                                                    |
| -------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| `GET`    | `/api/hooks/config`                      | Get hooks configuration                                                        |
| `PUT`    | `/api/hooks/config`                      | Save full hooks configuration                                                  |
| `POST`   | `/api/hooks/steps`                       | Add a command step (`{ name, command }`)                                       |
| `PATCH`  | `/api/hooks/steps/:stepId`               | Update a step (`{ name?, command?, enabled?, trigger? }`)                      |
| `DELETE` | `/api/hooks/steps/:stepId`               | Remove a step                                                                  |
| `POST`   | `/api/hooks/skills/import`               | Import a skill (`{ skillName, trigger?, condition? }`)                         |
| `GET`    | `/api/hooks/skills/available`            | List available skills from registry                                            |
| `PATCH`  | `/api/hooks/skills/:name`                | Toggle a skill (`{ enabled, trigger? }`)                                       |
| `DELETE` | `/api/hooks/skills/:name`                | Remove a skill (`?trigger=` query param)                                       |
| `POST`   | `/api/worktrees/:id/hooks/run`           | Run all enabled steps for a worktree                                           |
| `POST`   | `/api/worktrees/:id/hooks/run/:stepId`   | Run a single step                                                              |
| `GET`    | `/api/worktrees/:id/hooks/status`        | Get latest run status                                                          |
| `POST`   | `/api/worktrees/:id/hooks/report`        | Report a skill result (`{ skillName, success, summary, content?, filePath? }`) |
| `GET`    | `/api/worktrees/:id/hooks/skill-results` | Get skill results for a worktree                                               |
| `GET`    | `/api/files/read?path=...`               | Read a file by absolute path (used for MD report preview)                      |

## Backend

### HooksManager (`src/server/verification-manager.ts`)

The `HooksManager` class manages all hooks state and execution:

- **Config**: `getConfig()`, `saveConfig()`, `addStep()`, `removeStep()`, `updateStep()`
- **Skills**: `importSkill()`, `removeSkill()`, `toggleSkill()`, `ensureSkillsImported()`, `getEffectiveSkills()`
- **Execution**: `runAll()`, `runSingle()` -- command step execution with timeout
- **Skill results**: `reportSkillResult()`, `getSkillResults()` -- agent-reported results
- **Status**: `getStatus()` -- latest pipeline run for a worktree

### Routes (`src/server/routes/verification.ts`)

Registered via `registerHooksRoutes(app, manager, hooksManager)` in the server setup.

## Frontend

### HooksPanel (`src/ui/components/VerificationPanel.tsx`)

The top-level Hooks view. Displays four sections (one per trigger type), each containing:

- A header with icon, title, and description.
- Command step cards (editable, toggleable, removable).
- Skill cards (toggleable, removable).
- "Add command" and "Add skill" action buttons (mutually exclusive -- opening one closes the other).

Custom-trigger sections show an additional condition textarea for both command steps and skill imports.

### useHooksConfig (`src/ui/hooks/useHooks.ts`)

Hook for fetching and saving hooks configuration. Returns `{ config, isLoading, refetch, saveConfig }`.

### useHookSkillResults (`src/ui/hooks/useHooks.ts`)

Hook for fetching agent-reported skill results for a worktree.

### Report Preview Modal

When a skill result includes a `filePath`, the HooksTab shows a "View report" link next to the skill name. Clicking it fetches the file content via `GET /api/files/read` and opens a modal with `MarkdownContent` rendering. This allows agents to produce detailed MD reports that users can read in a formatted preview.

### Issue Detail Panel: Hooks Tab

The Agents section in issue detail panels (Linear, Jira, Local) includes a Hooks tab that shows:

- Steps and skills grouped by trigger type (pre-implementation, post-implementation only -- on-demand hooks are not shown).
- Command steps displayed read-only (name + command).
- Skills with per-issue override toggles (Inherit / Enable / Disable).
