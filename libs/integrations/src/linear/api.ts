import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

import type {
  LinearCredentials,
  LinearProjectConfig,
  LinearIssueSummary,
  LinearIssueDetail,
  LinearTaskData,
} from "./types";

const LINEAR_API = "https://api.linear.app/graphql";

async function graphql<T>(
  creds: LinearCredentials,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const resp = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: creds.apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Linear API error: ${resp.status} ${body}`);
  }

  const json = (await resp.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
  }
  if (!json.data) {
    throw new Error("Linear API returned no data");
  }
  return json.data;
}

export async function testConnection(
  creds: LinearCredentials,
): Promise<{ id: string; name: string; email: string }> {
  const data = await graphql<{ viewer: { id: string; name: string; email: string } }>(
    creds,
    `query { viewer { id name email } }`,
  );
  return data.viewer;
}

export interface LinearStatusOption {
  id: string;
  name: string;
  type: string;
  color: string;
}

export interface LinearPriorityOption {
  value: number;
  label: string;
}

export async function fetchIssues(
  creds: LinearCredentials,
  teamKey?: string,
  query?: string,
): Promise<LinearIssueSummary[]> {
  let filter =
    "assignee: { isMe: { eq: true } }, completedAt: { null: true }, canceledAt: { null: true }";
  if (teamKey) {
    filter += `, team: { key: { eq: "${teamKey}" } }`;
  }

  const searchQuery = query
    ? `query IssueSearch($query: String!) {
        issueSearch(query: $query, filter: { ${filter} }, orderBy: updatedAt, first: 50) {
          nodes {
            identifier
            title
            state { name type color }
            priority
            priorityLabel
            assignee { name }
            updatedAt
            labels { nodes { name color } }
            url
          }
        }
      }`
    : `query Issues {
        issues(filter: { ${filter} }, orderBy: updatedAt, first: 50) {
          nodes {
            identifier
            title
            state { name type color }
            priority
            priorityLabel
            assignee { name }
            updatedAt
            labels { nodes { name color } }
            url
          }
        }
      }`;

  const data = await graphql<{
    issues?: { nodes: RawIssueNode[] };
    issueSearch?: { nodes: RawIssueNode[] };
  }>(creds, searchQuery, query ? { query } : undefined);

  const nodes = data.issueSearch?.nodes ?? data.issues?.nodes ?? [];
  return nodes.map(mapIssueSummary);
}

interface RawIssueNode {
  identifier: string;
  title: string;
  state: { name: string; type: string; color: string };
  priority: number;
  priorityLabel: string;
  assignee: { name: string } | null;
  updatedAt: string;
  labels: { nodes: Array<{ name: string; color: string }> };
  url: string;
}

function mapIssueSummary(node: RawIssueNode): LinearIssueSummary {
  return {
    identifier: node.identifier,
    title: node.title,
    state: node.state,
    priority: node.priority,
    priorityLabel: node.priorityLabel,
    assignee: node.assignee?.name ?? null,
    updatedAt: node.updatedAt,
    labels: node.labels.nodes,
    url: node.url,
  };
}

export async function fetchIssue(
  identifier: string,
  creds: LinearCredentials,
): Promise<LinearIssueDetail> {
  // Parse "ENG-123" into team key "ENG" and number 123
  const match = identifier.match(/^([A-Za-z]+)-(\d+)$/);
  if (!match) {
    throw new Error(
      `Invalid Linear identifier format: "${identifier}". Expected format like ENG-123.`,
    );
  }
  const teamKey = match[1].toUpperCase();
  const issueNumber = parseInt(match[2], 10);

  const data = await graphql<{
    viewer: { id: string };
    issues: {
      nodes: Array<{
        identifier: string;
        title: string;
        description: string | null;
        state: { name: string; type: string; color: string };
        priority: number;
        priorityLabel: string;
        assignee: { name: string } | null;
        createdAt: string;
        updatedAt: string;
        labels: { nodes: Array<{ name: string; color: string }> };
        url: string;
        comments: {
          nodes: Array<{
            id: string;
            user: { id: string; name: string } | null;
            body: string;
            createdAt: string;
          }>;
        };
        attachments: {
          nodes: Array<{
            title: string;
            subtitle: string | null;
            url: string;
            sourceType: string | null;
          }>;
        };
      }>;
    };
  }>(
    creds,
    `query IssueDetail($teamKey: String!, $number: Float!) {
      viewer {
        id
      }
      issues(filter: { team: { key: { eq: $teamKey } }, number: { eq: $number } }, first: 1) {
        nodes {
          identifier
          title
          description
          state { name type color }
          priority
          priorityLabel
          assignee { name }
          createdAt
          updatedAt
          labels { nodes { name color } }
          url
          comments(orderBy: createdAt, first: 50) {
            nodes {
              id
              user { id name }
              body
              createdAt
            }
          }
          attachments(first: 50) {
            nodes {
              title
              subtitle
              url
              sourceType
            }
          }
        }
      }
    }`,
    { teamKey, number: issueNumber },
  );

  const node = data.issues.nodes[0];
  if (!node) {
    throw new Error(`Issue ${identifier} not found`);
  }

  return {
    identifier: node.identifier,
    title: node.title,
    description: node.description,
    state: node.state,
    priority: node.priority,
    priorityLabel: node.priorityLabel,
    assignee: node.assignee?.name ?? null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    labels: node.labels.nodes,
    url: node.url,
    comments: node.comments.nodes.map((c) => ({
      id: c.id,
      author: c.user?.name ?? "Unknown",
      body: c.body,
      createdAt: c.createdAt,
      canEdit: !!c.user?.id && c.user.id === data.viewer.id,
    })),
    attachments: node.attachments.nodes,
  };
}

export async function fetchStatusOptions(
  creds: LinearCredentials,
  teamKey?: string,
): Promise<LinearStatusOption[]> {
  const data = teamKey
    ? await graphql<{
        workflowStates: {
          nodes: Array<{
            id: string;
            name: string;
            type: string;
            color: string;
          }>;
        };
      }>(
        creds,
        `query WorkflowStates($teamKey: String!) {
          workflowStates(filter: { team: { key: { eq: $teamKey } } }, first: 100) {
            nodes {
              id
              name
              type
              color
            }
          }
        }`,
        { teamKey },
      )
    : await graphql<{
        workflowStates: {
          nodes: Array<{
            id: string;
            name: string;
            type: string;
            color: string;
          }>;
        };
      }>(
        creds,
        `query WorkflowStates {
          workflowStates(first: 100) {
            nodes {
              id
              name
              type
              color
            }
          }
        }`,
      );

  const options = data.workflowStates.nodes
    .map((state) => ({
      id: state.id,
      name: state.name,
      type: state.type,
      color: state.color,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return options;
}

interface LinearIssueIdentity {
  id: string;
  identifier: string;
}

async function resolveIssueIdentity(
  creds: LinearCredentials,
  identifier: string,
): Promise<LinearIssueIdentity & { teamKey: string }> {
  const match = identifier.match(/^([A-Za-z]+)-(\d+)$/);
  if (!match) {
    throw new Error(
      `Invalid Linear identifier format: "${identifier}". Expected format like ENG-123.`,
    );
  }
  const teamKey = match[1].toUpperCase();
  const issueNumber = parseInt(match[2], 10);
  const data = await graphql<{
    issues: {
      nodes: Array<{
        id: string;
        identifier: string;
        team: { key: string };
      }>;
    };
  }>(
    creds,
    `query IssueIdentity($teamKey: String!, $number: Float!) {
      issues(filter: { team: { key: { eq: $teamKey } }, number: { eq: $number } }, first: 1) {
        nodes {
          id
          identifier
          team { key }
        }
      }
    }`,
    { teamKey, number: issueNumber },
  );
  const issue = data.issues.nodes[0];
  if (!issue) {
    throw new Error(`Issue ${identifier} not found`);
  }
  return { ...issue, teamKey: issue.team.key };
}

export async function updateIssueStatus(
  creds: LinearCredentials,
  identifier: string,
  statusName: string,
  teamKey?: string,
): Promise<void> {
  const issue = await resolveIssueIdentity(creds, identifier);
  const options = await fetchStatusOptions(creds, teamKey || issue.teamKey);
  const next = options.find(
    (option) => option.name.toLowerCase() === statusName.trim().toLowerCase(),
  );
  if (!next) {
    throw new Error(`Status "${statusName}" is not available`);
  }
  await graphql(
    creds,
    `mutation UpdateIssueStatus($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) {
        success
      }
    }`,
    { id: issue.id, stateId: next.id },
  );
}

export async function fetchIssueStatusOptions(
  creds: LinearCredentials,
  identifier: string,
): Promise<LinearStatusOption[]> {
  const issue = await resolveIssueIdentity(creds, identifier);
  return fetchStatusOptions(creds, issue.teamKey);
}

export async function fetchPriorityOptions(
  creds: LinearCredentials,
): Promise<LinearPriorityOption[]> {
  const data = await graphql<{
    issuePriorityValues?: Array<{ priority?: number; label?: string }>;
  }>(
    creds,
    `query IssuePriorityValues {
      issuePriorityValues {
        priority
        label
      }
    }`,
  );

  const options = (data.issuePriorityValues ?? [])
    .map((option) => ({
      value: option.priority,
      label: option.label?.trim() ?? "",
    }))
    .filter((option): option is LinearPriorityOption => {
      return typeof option.value === "number" && Number.isInteger(option.value) && !!option.label;
    })
    .sort((a, b) => a.value - b.value);

  return options;
}

export async function updateIssuePriority(
  creds: LinearCredentials,
  identifier: string,
  priority: number,
): Promise<void> {
  if (!Number.isInteger(priority) || priority < 0 || priority > 4) {
    throw new Error("priority must be an integer between 0 and 4");
  }
  const issue = await resolveIssueIdentity(creds, identifier);
  await graphql(
    creds,
    `mutation UpdateIssuePriority($id: String!, $priority: Int!) {
      issueUpdate(id: $id, input: { priority: $priority }) {
        success
      }
    }`,
    { id: issue.id, priority },
  );
}

export async function updateIssueDescription(
  creds: LinearCredentials,
  identifier: string,
  description: string,
): Promise<void> {
  const issue = await resolveIssueIdentity(creds, identifier);
  await graphql(
    creds,
    `mutation UpdateIssueDescription($id: String!, $description: String) {
      issueUpdate(id: $id, input: { description: $description }) {
        success
      }
    }`,
    { id: issue.id, description },
  );
}

export async function updateIssueTitle(
  creds: LinearCredentials,
  identifier: string,
  title: string,
): Promise<void> {
  const issue = await resolveIssueIdentity(creds, identifier);
  await graphql(
    creds,
    `mutation UpdateIssueTitle($id: String!, $title: String!) {
      issueUpdate(id: $id, input: { title: $title }) {
        success
      }
    }`,
    { id: issue.id, title },
  );
}

export async function addIssueComment(
  creds: LinearCredentials,
  identifier: string,
  body: string,
): Promise<void> {
  const issue = await resolveIssueIdentity(creds, identifier);
  await graphql(
    creds,
    `mutation CreateIssueComment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) {
        success
      }
    }`,
    { issueId: issue.id, body },
  );
}

export async function updateIssueComment(
  creds: LinearCredentials,
  commentId: string,
  body: string,
): Promise<void> {
  await graphql(
    creds,
    `mutation UpdateComment($id: String!, $body: String!) {
      commentUpdate(id: $id, input: { body: $body }) {
        success
      }
    }`,
    { id: commentId, body },
  );
}

export async function deleteIssueComment(
  creds: LinearCredentials,
  commentId: string,
): Promise<void> {
  await graphql(
    creds,
    `mutation DeleteComment($id: String!) {
      commentDelete(id: $id) {
        success
      }
    }`,
    { id: commentId },
  );
}

export function resolveIdentifier(id: string, config: LinearProjectConfig): string {
  if (id.includes("-")) return id.toUpperCase();

  if (!config.defaultTeamKey) {
    throw new Error(
      `Issue ID "${id}" has no team prefix and no defaultTeamKey is configured.\n` +
        `Either use the full identifier (e.g. ENG-${id}) or set defaultTeamKey in Linear settings.`,
    );
  }

  return `${config.defaultTeamKey}-${id}`;
}

export function saveTaskData(taskData: LinearTaskData, tasksDir: string): void {
  // Write to issues/linear/<IDENTIFIER>/issue.json
  const issueDir = path.join(path.dirname(tasksDir), "issues", "linear", taskData.identifier);
  mkdirSync(issueDir, { recursive: true });
  writeFileSync(path.join(issueDir, "issue.json"), JSON.stringify(taskData, null, 2) + "\n");

  // Create empty notes.json if it doesn't exist
  const notesPath = path.join(issueDir, "notes.json");
  if (!existsSync(notesPath)) {
    writeFileSync(
      notesPath,
      JSON.stringify(
        {
          linkedWorktreeId: null,
          personal: null,
          aiContext: null,
        },
        null,
        2,
      ) + "\n",
    );
  }
}
