import { randomUUID } from "crypto";
import path from "path";

const MAX_CAPTURE_LENGTH = 16_000;
const SENSITIVE_QUERY_PARAM_PATTERN =
  /(^|[_-])(token|password|passwd|secret|apikey|api-key|auth|authorization|cookie|signature|sig)([_-]|$)/i;

export interface FetchMonitorEvent {
  runId: string;
  phase: "success" | "failure";
  timestamp: string;
  source: string;
  method: string;
  url: string;
  path: string;
  statusCode?: number;
  durationMs: number;
  requestContentType?: string;
  requestPayload?: string;
  requestPayloadTruncated?: boolean;
  requestPayloadOmitted?: boolean;
  requestPayloadError?: string;
  requestTransport?: "ws";
  responseContentType?: string;
  responsePayload?: string;
  responsePayloadTruncated?: boolean;
  responsePayloadOmitted?: boolean;
  responsePayloadError?: string;
  responseTransport?: "sse" | "ws";
  error?: string;
}

type FetchMonitorSink = (event: FetchMonitorEvent) => void;

let installed = false;
let sink: FetchMonitorSink | null = null;

function emit(event: FetchMonitorEvent): void {
  if (!sink) return;
  try {
    sink(event);
  } catch {
    // Never let sink failures impact fetch execution.
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

function normalizeMethod(method: string | null | undefined): string {
  if (!method) return "GET";
  const normalized = method.trim().toUpperCase();
  return normalized.length > 0 ? normalized : "GET";
}

function normalizeContentType(contentType: string | null | undefined): string {
  if (!contentType) return "";
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isTextPayloadContentType(contentType: string): boolean {
  if (!contentType) return false;
  if (contentType.startsWith("text/")) return true;
  if (contentType === "application/json") return true;
  if (contentType.endsWith("+json")) return true;
  if (contentType === "application/x-www-form-urlencoded") return true;
  if (contentType === "application/xml" || contentType === "text/xml") return true;
  if (contentType === "application/graphql") return true;
  return false;
}

function truncate(value: string): { value: string; truncated: boolean } {
  if (value.length <= MAX_CAPTURE_LENGTH) return { value, truncated: false };
  return {
    value: `${value.slice(0, MAX_CAPTURE_LENGTH)}\n...[truncated]`,
    truncated: true,
  };
}

function isSensitiveQueryKey(key: string): boolean {
  return SENSITIVE_QUERY_PARAM_PATTERN.test(key.trim().toLowerCase());
}

function sanitizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    for (const [key] of parsed.searchParams) {
      if (isSensitiveQueryKey(key)) {
        parsed.searchParams.set(key, "***");
      }
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function extractPathForLog(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname || "/";
    return `${parsed.origin}${pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function stackSource(): string {
  const stack = new Error().stack;
  if (!stack) return "unknown";

  const lines = stack
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (
      line.includes("runtime/fetch-monitor") ||
      line.includes("node:internal") ||
      line.includes("internal/modules")
    ) {
      continue;
    }

    const match = line.match(/\(?([^()\s]+):(\d+):(\d+)\)?$/);
    const file = match?.[1];
    const lineNo = match?.[2];
    if (!file) continue;
    if (file.startsWith("node:")) continue;

    const relative = file.startsWith(process.cwd())
      ? path.relative(process.cwd(), file)
      : file.replace(/^file:\/\//, "");
    return lineNo ? `${relative}:${lineNo}` : relative;
  }

  return "unknown";
}

async function captureRequestMetadata(request: Request): Promise<Partial<FetchMonitorEvent>> {
  const method = normalizeMethod(request.method);
  const metadata: Partial<FetchMonitorEvent> = {};

  const requestUpgrade = (request.headers.get("upgrade") ?? "").trim().toLowerCase();
  if (requestUpgrade === "websocket") {
    metadata.requestTransport = "ws";
  }

  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return metadata;
  }

  const requestContentType = normalizeContentType(request.headers.get("content-type"));
  if (!requestContentType) return metadata;

  metadata.requestContentType = requestContentType;
  if (!isTextPayloadContentType(requestContentType)) {
    metadata.requestPayloadOmitted = true;
    return metadata;
  }

  try {
    const payload = await request.clone().text();
    if (!payload) return metadata;

    const truncatedPayload = truncate(payload);
    metadata.requestPayload = truncatedPayload.value;
    if (truncatedPayload.truncated) {
      metadata.requestPayloadTruncated = true;
    }
    return metadata;
  } catch {
    metadata.requestPayloadError = "Failed to read request payload";
    return metadata;
  }
}

async function captureResponseMetadata(response: Response): Promise<Partial<FetchMonitorEvent>> {
  const metadata: Partial<FetchMonitorEvent> = {};

  if (response.status === 101) {
    metadata.responseTransport = "ws";
    return metadata;
  }

  const responseContentType = normalizeContentType(response.headers.get("content-type"));
  if (!responseContentType) return metadata;

  metadata.responseContentType = responseContentType;
  if (responseContentType === "text/event-stream") {
    metadata.responseTransport = "sse";
    return metadata;
  }

  if (!isTextPayloadContentType(responseContentType)) {
    metadata.responsePayloadOmitted = true;
    return metadata;
  }

  if (response.status === 204 || response.status === 304 || response.body === null) {
    return metadata;
  }

  try {
    const payload = await response.clone().text();
    if (!payload) return metadata;

    const truncatedPayload = truncate(payload);
    metadata.responsePayload = truncatedPayload.value;
    if (truncatedPayload.truncated) {
      metadata.responsePayloadTruncated = true;
    }
    return metadata;
  } catch {
    metadata.responsePayloadError = "Failed to read response payload";
    return metadata;
  }
}

function toInputUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function setFetchMonitorSink(nextSink: FetchMonitorSink | null): void {
  sink = nextSink;
}

export function installFetchMonitor(): void {
  if (installed) return;
  if (typeof globalThis.fetch !== "function") return;

  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const runId = randomUUID();
    const startedAt = Date.now();
    const source = stackSource();

    let request: Request;
    try {
      request = new Request(input, init);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const rawUrl = sanitizeUrl(toInputUrl(input));
      emit({
        runId,
        phase: "failure",
        timestamp: timestamp(),
        source,
        method: normalizeMethod(init?.method ?? null),
        url: rawUrl,
        path: extractPathForLog(rawUrl),
        durationMs: Date.now() - startedAt,
        error: `Failed to initialize request: ${message}`,
      });
      throw error;
    }

    const method = normalizeMethod(request.method);
    const url = sanitizeUrl(request.url || toInputUrl(input));
    const pathForLog = extractPathForLog(url);
    const requestMetadata = await captureRequestMetadata(request);

    try {
      const response = await originalFetch(request);
      const responseMetadata = await captureResponseMetadata(response);
      emit({
        runId,
        phase: "success",
        timestamp: timestamp(),
        source,
        method,
        url,
        path: pathForLog,
        statusCode: response.status,
        durationMs: Date.now() - startedAt,
        ...requestMetadata,
        ...responseMetadata,
      });
      return response;
    } catch (error) {
      emit({
        runId,
        phase: "failure",
        timestamp: timestamp(),
        source,
        method,
        url,
        path: pathForLog,
        durationMs: Date.now() - startedAt,
        ...requestMetadata,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }) as typeof globalThis.fetch;

  installed = true;
}
