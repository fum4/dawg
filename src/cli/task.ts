import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "fs";
import path from "path";
import { input, select } from "@inquirer/prompts";

import { APP_NAME, CONFIG_DIR_NAME } from "../constants";
import { copyEnvFiles } from "../core/env-files";
import { log } from "../logger";
import { loadJiraCredentials, loadJiraProjectConfig } from "../integrations/jira/credentials";
import { getApiBase, getAuthHeaders } from "../integrations/jira/auth";
import {
  resolveTaskKey,
  fetchIssue as fetchJiraIssue,
  saveTaskData as saveJiraTaskData,
  downloadAttachments,
} from "../integrations/jira/api";
import type { JiraTaskData } from "../integrations/jira/types";
import { loadLinearCredentials, loadLinearProjectConfig } from "../integrations/linear/credentials";
import {
  resolveIdentifier as resolveLinearId,
  fetchIssue as fetchLinearIssue,
  saveTaskData as saveLinearTaskData,
} from "../integrations/linear/api";
import type { LinearTaskData } from "../integrations/linear/types";
import { findConfigDir, loadConfig } from "./config";

export type Source = "jira" | "linear" | "local";

export async function runTask(source: Source, taskIds: string[], batch: boolean) {
  for (const id of taskIds) {
    await processTask(source, id, batch);
  }
}

export async function runTaskInteractive() {
  const source = await select<Source>({
    message: "Issue source",
    choices: [
      { name: "Jira", value: "jira" },
      { name: "Linear", value: "linear" },
      { name: "Local", value: "local" },
    ],
  });

  const id = await input({ message: "Issue ID" });
  if (!id.trim()) {
    log.error("No issue ID provided.");
    process.exit(1);
  }

  await processTask(source, id.trim(), false);
}

async function processTask(source: Source, taskId: string, batch: boolean) {
  const configDir = findConfigDir();
  if (!configDir) {
    log.error(`No config found. Run "${APP_NAME} init" first.`);
    process.exit(1);
  }

  switch (source) {
    case "jira":
      return processJiraTask(taskId, configDir, batch);
    case "linear":
      return processLinearTask(taskId, configDir, batch);
    case "local":
      return processLocalTask(taskId, configDir, batch);
  }
}

// ─── Jira ────────────────────────────────────────────────────────────────────

async function processJiraTask(taskId: string, configDir: string, batch: boolean) {
  const creds = loadJiraCredentials(configDir);
  if (!creds) {
    log.error(`Jira not connected. Run "${APP_NAME} add jira" first.`);
    process.exit(1);
  }

  const projectConfig = loadJiraProjectConfig(configDir);
  const key = resolveTaskKey(taskId, projectConfig);

  log.info(`Fetching ${key}...`);

  let taskData: JiraTaskData;
  try {
    taskData = await fetchJiraIssue(key, creds, configDir);
  } catch (err) {
    if (batch) {
      log.error(`Failed to fetch ${key}: ${err instanceof Error ? err.message : err}`);
      return;
    }
    throw err;
  }

  printSummary(
    taskData.key,
    taskData.summary,
    taskData.status,
    taskData.priority,
    taskData.assignee,
    taskData.labels,
    taskData.url,
  );

  const tasksDir = path.join(configDir, CONFIG_DIR_NAME, "tasks");
  saveJiraTaskData(taskData, tasksDir);
  log.success(`Task saved`);

  // Download attachments
  if (taskData.attachments.length > 0) {
    log.info(`Downloading ${taskData.attachments.length} attachment(s)...`);

    const base = getApiBase(creds);
    const headers = await getAuthHeaders(creds, configDir);

    const resp = await fetch(`${base}/issue/${encodeURIComponent(key)}?fields=attachment`, {
      headers,
    });
    if (resp.ok) {
      const issue = (await resp.json()) as {
        fields: {
          attachment: Array<{ filename: string; content: string; mimeType: string; size: number }>;
        };
      };
      const attachmentsDir = path.join(tasksDir, key, "attachments");
      const downloaded = await downloadAttachments(
        issue.fields.attachment,
        attachmentsDir,
        creds,
        configDir,
      );
      taskData.attachments = downloaded;
      saveJiraTaskData(taskData, tasksDir);
      log.success(`${downloaded.length} attachment(s) downloaded`);
    }
  }

  await handleWorktreeAction(taskData.key, batch, configDir, (branchName) => {
    taskData.linkedWorktree = branchName;
    saveJiraTaskData(taskData, tasksDir);
  });
}

// ─── Linear ──────────────────────────────────────────────────────────────────

async function processLinearTask(taskId: string, configDir: string, batch: boolean) {
  const creds = loadLinearCredentials(configDir);
  if (!creds) {
    log.error(`Linear not connected. Run "${APP_NAME} add linear" first.`);
    process.exit(1);
  }

  const projectConfig = loadLinearProjectConfig(configDir);
  const identifier = resolveLinearId(taskId, projectConfig);

  log.info(`Fetching ${identifier}...`);

  let issue;
  try {
    issue = await fetchLinearIssue(identifier, creds);
  } catch (err) {
    if (batch) {
      log.error(`Failed to fetch ${identifier}: ${err instanceof Error ? err.message : err}`);
      return;
    }
    throw err;
  }

  const taskData: LinearTaskData = {
    source: "linear",
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description,
    status: issue.state.name,
    priority: issue.priority,
    assignee: issue.assignee,
    labels: issue.labels,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    comments: issue.comments,
    attachments: issue.attachments,
    linkedWorktree: null,
    fetchedAt: new Date().toISOString(),
    url: issue.url,
  };

  printSummary(
    issue.identifier,
    issue.title,
    issue.state.name,
    null,
    issue.assignee,
    issue.labels.map((l) => l.name),
    issue.url,
  );

  const tasksDir = path.join(configDir, CONFIG_DIR_NAME, "tasks");
  saveLinearTaskData(taskData, tasksDir);
  log.success(`Task saved`);

  await handleWorktreeAction(identifier, batch, configDir, (branchName) => {
    taskData.linkedWorktree = branchName;
    saveLinearTaskData(taskData, tasksDir);
  });
}

// ─── Local ───────────────────────────────────────────────────────────────────

async function processLocalTask(taskId: string, configDir: string, batch: boolean) {
  const id = taskId.toUpperCase().startsWith("LOCAL-") ? taskId.toUpperCase() : `LOCAL-${taskId}`;
  const taskFile = path.join(configDir, ".dawg", "issues", "local", id, "task.json");

  if (!existsSync(taskFile)) {
    if (batch) {
      log.error(`Local issue ${id} not found.`);
      return;
    }
    log.error(`Local issue ${id} not found.`);
    process.exit(1);
  }

  const task = JSON.parse(readFileSync(taskFile, "utf-8")) as {
    id: string;
    title: string;
    status: string;
    priority: string;
    labels: string[];
  };

  printSummary(task.id, task.title, task.status, task.priority, null, task.labels, null);

  await handleWorktreeAction(task.id, batch, configDir, () => {
    // Local tasks don't have a linkedWorktree field to update in task.json
  });
}

// ─── Shared ──────────────────────────────────────────────────────────────────

function printSummary(
  key: string,
  title: string,
  status: string,
  priority: string | null,
  assignee: string | null,
  labels: string[],
  url: string | null,
) {
  console.log("");
  console.log(`  ${key}: ${title}`);
  const parts = [`Status: ${status}`];
  if (priority) parts.push(`Priority: ${priority}`);
  console.log(`  ${parts.join("  |  ")}`);
  if (assignee) console.log(`  Assignee: ${assignee}`);
  if (labels.length > 0) console.log(`  Labels: ${labels.join(", ")}`);
  if (url) console.log(`  URL: ${url}`);
  console.log("");
}

async function handleWorktreeAction(
  key: string,
  batch: boolean,
  configDir: string,
  onLink: (branchName: string) => void,
) {
  if (batch) {
    try {
      await createWorktreeForTask(key, configDir, onLink);
    } catch (err) {
      log.error(
        `Failed to create worktree for ${key}: ${err instanceof Error ? err.message : err}`,
      );
    }
    return;
  }

  console.log("");
  const action = await select({
    message: "What would you like to do?",
    choices: [
      { name: "Create a worktree for this task", value: "create" },
      { name: "Link to an existing worktree", value: "link" },
      { name: "Just save the data", value: "save" },
    ],
    default: "save",
  });

  if (action === "create") {
    await createWorktreeForTask(key, configDir, onLink);
  } else if (action === "link") {
    await linkWorktreeToTask(key, configDir, onLink);
  }

  log.success("Done.");
}

async function createWorktreeForTask(
  key: string,
  configDir: string,
  onLink: (branchName: string) => void,
) {
  const { config } = loadConfig();
  const branchName = key.toLowerCase();

  const worktreesDir = path.join(configDir, CONFIG_DIR_NAME, "worktrees");

  if (!existsSync(worktreesDir)) {
    mkdirSync(worktreesDir, { recursive: true });
  }

  const worktreePath = path.join(worktreesDir, branchName);

  if (existsSync(worktreePath)) {
    log.warn(`Worktree directory already exists: ${worktreePath}`);
    log.info("Linking to existing worktree instead.");
    onLink(branchName);
    return;
  }

  log.info(`Creating worktree at ${worktreePath} (branch: ${branchName})...`);

  // Prune stale worktree references before creating
  try {
    execFileSync("git", ["worktree", "prune"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    // Ignore prune errors
  }

  // Try creating with -b (new branch), fallback to existing branch, fallback to -B
  try {
    execFileSync("git", ["worktree", "add", "-b", branchName, worktreePath, config.baseBranch], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    try {
      execFileSync("git", ["worktree", "add", worktreePath, branchName], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      execFileSync("git", ["worktree", "add", "-B", branchName, worktreePath, config.baseBranch], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    }
  }

  log.success("Worktree created.");

  // Copy .env files
  copyEnvFiles(configDir, worktreePath, worktreesDir);

  // Run install command
  if (config.installCommand) {
    const projectSubdir =
      config.projectDir && config.projectDir !== "."
        ? path.join(worktreePath, config.projectDir)
        : worktreePath;

    log.info(`Running: ${config.installCommand}`);
    try {
      const [cmd, ...args] = config.installCommand.split(" ");
      execFileSync(cmd, args, {
        encoding: "utf-8",
        cwd: projectSubdir,
        stdio: "inherit",
      });
    } catch (err) {
      log.warn(`Install command failed: ${err}`);
    }
  }

  onLink(branchName);
  log.success(`Worktree linked to task ${key}`);
}

async function linkWorktreeToTask(
  key: string,
  configDir: string,
  onLink: (branchName: string) => void,
) {
  const worktreesDir = path.join(configDir, CONFIG_DIR_NAME, "worktrees");

  if (!existsSync(worktreesDir)) {
    log.warn("No worktrees directory found.");
    return;
  }

  const entries = readdirSync(worktreesDir, { withFileTypes: true }).filter(
    (e) => e.isDirectory() && existsSync(path.join(worktreesDir, e.name, ".git")),
  );

  if (entries.length === 0) {
    log.warn("No existing worktrees found.");
    return;
  }

  const chosen = await select({
    message: "Select worktree",
    choices: entries.map((e) => ({
      name: e.name,
      value: e.name,
    })),
  });

  onLink(chosen);
  log.success(`Task ${key} linked to worktree: ${chosen}`);
}
