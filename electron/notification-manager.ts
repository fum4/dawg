import http from "http";
import { BrowserWindow, Notification } from "electron";
import type { ProjectManager } from "./project-manager.js";

interface ActivityEvent {
  id: string;
  timestamp: string;
  category: string;
  type: string;
  severity: string;
  title: string;
  detail?: string;
  worktreeId?: string;
  projectName?: string;
}

// Events that trigger native OS notifications when app is unfocused
const OS_NOTIFICATION_EVENTS = new Set([
  "creation_completed",
  "creation_failed",
  "skill_failed",
  "crashed",
]);

const DEBOUNCE_MS = 10_000; // Max 1 notification per 10s per project
const RECONNECT_MS = 5_000;

export class NotificationManager {
  private lastNotificationTime: Map<string, number> = new Map();
  private connections: Map<number, http.ClientRequest> = new Map();
  private reconnectTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();

  constructor(
    private getMainWindow: () => BrowserWindow | null,
    private projectManager: ProjectManager,
  ) {}

  /**
   * Start listening to SSE activity streams for all open projects.
   * Call this after projects are loaded or when a project is added/removed.
   */
  syncProjectStreams(): void {
    const projects = this.projectManager.getProjects();
    const activePorts = new Set<number>();

    for (const project of projects) {
      if (project.status !== "running") continue;

      activePorts.add(project.port);

      // Already connected
      if (this.connections.has(project.port)) continue;

      this.connectToProject(project.port, project.name);
    }

    // Clean up disconnected projects
    for (const [port, req] of this.connections) {
      if (!activePorts.has(port)) {
        req.destroy();
        this.connections.delete(port);
        const timer = this.reconnectTimers.get(port);
        if (timer) {
          clearTimeout(timer);
          this.reconnectTimers.delete(port);
        }
      }
    }
  }

  private connectToProject(port: number, projectName: string): void {
    const req = http.get(`http://localhost:${port}/api/events`, (res) => {
      let buffer = "";

      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "activity") {
                this.handleActivityEvent(data.event as ActivityEvent, projectName);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      });

      res.on("end", () => {
        this.connections.delete(port);
        this.scheduleReconnect(port, projectName);
      });
    });

    req.on("error", () => {
      this.connections.delete(port);
      this.scheduleReconnect(port, projectName);
    });

    this.connections.set(port, req);
  }

  private scheduleReconnect(port: number, projectName: string): void {
    // Only reconnect if project is still running
    const projects = this.projectManager.getProjects();
    const project = projects.find((p) => p.port === port);
    if (!project || project.status !== "running") return;

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(port);
      this.connectToProject(port, projectName);
    }, RECONNECT_MS);

    this.reconnectTimers.set(port, timer);
  }

  private handleActivityEvent(event: ActivityEvent, projectName: string): void {
    if (!OS_NOTIFICATION_EVENTS.has(event.type)) return;

    const mainWindow = this.getMainWindow();
    if (!mainWindow || mainWindow.isFocused()) return;

    // Debounce per project
    const now = Date.now();
    const lastTime = this.lastNotificationTime.get(projectName) ?? 0;
    if (now - lastTime < DEBOUNCE_MS) return;
    this.lastNotificationTime.set(projectName, now);

    // Fire native notification
    const notification = new Notification({
      title: `dawg - ${projectName}`,
      body: event.title,
      silent: false,
    });

    notification.on("click", () => {
      mainWindow?.show();
      mainWindow?.focus();
    });

    notification.show();
  }

  dispose(): void {
    for (const req of this.connections.values()) {
      req.destroy();
    }
    this.connections.clear();

    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
  }
}
