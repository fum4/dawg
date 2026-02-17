# Instructions Directory

Agent instruction text extracted from TypeScript source into standalone markdown files. These are inlined as strings at build time via tsup's esbuild text loader (`{ '.md': 'text' }`).

## How It Works

1. **Build**: tsup loads `.md` files as text strings via the esbuild loader configured in `tsup.config.ts`
2. **Barrel**: `index.ts` imports all `.md` files, resolves placeholders (`{{APP_NAME}}`, `{{WORKFLOW}}`), and exports typed constants
3. **Consumers**: Source files import from this barrel — no raw `.md` imports scattered across the codebase
4. **TypeScript**: `src/md.d.ts` declares `*.md` modules so TS accepts the imports

## File Map

### Root (`src/instructions/`)

| File                  | Export                    | Used By                 | Purpose                                                                 |
| --------------------- | ------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `mcp-server.md`       | `MCP_INSTRUCTIONS`        | `mcp-server-factory.ts` | Server-level MCP instructions                                           |
| `mcp-work-on-task.md` | `MCP_WORK_ON_TASK_PROMPT` | `mcp-server-factory.ts` | "work-on-task" MCP prompt template (`{{ISSUE_ID}}` resolved at runtime) |

### Agents (`src/instructions/agents/`)

| File                 | Export          | Deployed To                      | Purpose                                                                   |
| -------------------- | --------------- | -------------------------------- | ------------------------------------------------------------------------- |
| `shared-workflow.md` | _(internal)_    | —                                | Shared workflow steps, interpolated into cursor/vscode via `{{WORKFLOW}}` |
| `claude-skill.md`    | `CLAUDE_SKILL`  | `~/.claude/skills/work/SKILL.md` | Claude Code skill                                                         |
| `cursor-rule.md`     | `CURSOR_RULE`   | `.cursor/rules/dawg.mdc`         | Cursor rule                                                               |
| `vscode-prompt.md`   | `VSCODE_PROMPT` | `.github/prompts/work.prompt.md` | VS Code Copilot prompt                                                    |

### Skills (`src/instructions/skills/`)

| File                   | Deployed To                                 | Purpose                    |
| ---------------------- | ------------------------------------------- | -------------------------- |
| `summarize-changes.md` | `~/.dawg/skills/summarize-changes/SKILL.md` | Diff-based changes summary |
| `review-changes.md`    | `~/.dawg/skills/review-changes/SKILL.md`    | Self code review           |
| `how-to-test.md`       | `~/.dawg/skills/how-to-test/SKILL.md`       | Manual testing walkthrough |
| `write-tests.md`       | `~/.dawg/skills/write-tests/SKILL.md`       | Automated test writing     |
| `explain-like-im-5.md` | `~/.dawg/skills/explain-like-im-5/SKILL.md` | ELI5 explanation           |

## Placeholder Conventions

| Placeholder    | Resolved                     | Value                               |
| -------------- | ---------------------------- | ----------------------------------- |
| `{{APP_NAME}}` | At import time in `index.ts` | `APP_NAME` constant ("dawg")        |
| `{{WORKFLOW}}` | At import time in `index.ts` | Content of `shared-workflow.md`     |
| `{{ISSUE_ID}}` | At runtime by caller         | Function argument (e.g. "PROJ-123") |
