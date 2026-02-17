import { APP_NAME } from "../constants";

import mcpServerMd from "./mcp-server.md";
import mcpWorkOnTaskMd from "./mcp-work-on-task.md";
import sharedWorkflowMd from "./agents/shared-workflow.md";
import claudeSkillMd from "./agents/claude-skill.md";
import cursorRuleMd from "./agents/cursor-rule.md";
import vscodePromptMd from "./agents/vscode-prompt.md";
import summarizeChangesMd from "./skills/summarize-changes.md";
import reviewChangesMd from "./skills/review-changes.md";
import howToTestMd from "./skills/how-to-test.md";
import writeTestsMd from "./skills/write-tests.md";
import explainLikeIm5Md from "./skills/explain-like-im-5.md";

// ─── Placeholder resolution ─────────────────────────────────────

function resolve(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    template,
  );
}

const shared = { APP_NAME };
const withWorkflow = { ...shared, WORKFLOW: sharedWorkflowMd };

// ─── Exports ─────────────────────────────────────────────────────

/** MCP server-level instructions (sent as McpServer `instructions` option) */
export const MCP_INSTRUCTIONS = resolve(mcpServerMd, shared);

/** Prompt text for the "work-on-task" MCP prompt. Call `.replace('{{ISSUE_ID}}', id)` at runtime. */
export const MCP_WORK_ON_TASK_PROMPT = mcpWorkOnTaskMd;

/** Claude Code SKILL.md content (deployed to ~/.claude/skills/work/SKILL.md) */
export const CLAUDE_SKILL = claudeSkillMd;

/** Cursor rule content (deployed to .cursor/rules/dawg.mdc) */
export const CURSOR_RULE = resolve(cursorRuleMd, withWorkflow);

/** VS Code Copilot prompt content (deployed to .github/prompts/work.prompt.md) */
export const VSCODE_PROMPT = resolve(vscodePromptMd, withWorkflow);

// ─── Predefined hook skills ─────────────────────────────────────

export interface PredefinedSkill {
  dirName: string;
  content: string;
}

export const PREDEFINED_SKILLS: PredefinedSkill[] = [
  { dirName: "summarize-changes", content: summarizeChangesMd },
  { dirName: "review-changes", content: reviewChangesMd },
  { dirName: "how-to-test", content: howToTestMd },
  { dirName: "write-tests", content: writeTestsMd },
  { dirName: "explain-like-im-5", content: explainLikeIm5Md },
];
