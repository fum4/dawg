import { vi, describe, it, expect, beforeEach } from "vitest";

import { renderHook, waitFor, act } from "../test/render";
import { useWorktrees } from "./useWorktrees";

let mockServerUrl: string | null = "";

vi.mock("../contexts/ServerContext", () => ({
  useServer: () => ({
    serverUrl: null,
    projects: [],
    activeProject: null,
    openProject: async () => ({ success: true }),
    closeProject: async () => {},
    switchProject: () => {},
    isElectron: false,
    projectsLoading: false,
    selectFolder: async () => null,
  }),
  useServerUrl: () => "",
  useServerUrlOptional: () => mockServerUrl,
  ServerProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe("useWorktrees", () => {
  beforeEach(() => {
    mockServerUrl = "";
  });

  it("returns empty worktrees initially", () => {
    const { result } = renderHook(() => useWorktrees());

    expect(result.current.worktrees).toEqual([]);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("creates EventSource on mount", async () => {
    renderHook(() => useWorktrees());

    await waitFor(() => {
      expect((globalThis.EventSource as any).instances.length).toBeGreaterThan(0);
    });

    expect((globalThis.EventSource as any).instances[0].url).toContain("/api/events");
  });

  it("parses SSE worktrees message and updates state", async () => {
    const { result } = renderHook(() => useWorktrees());

    await waitFor(() => {
      expect((globalThis.EventSource as any).instances.length).toBeGreaterThan(0);
    });

    const es = (globalThis.EventSource as any).instances[0];
    const worktreeData = [
      { id: "wt-1", name: "feature-a", branch: "feature-a", path: "/tmp/wt-1" },
      { id: "wt-2", name: "feature-b", branch: "feature-b", path: "/tmp/wt-2" },
    ];

    act(() => {
      es.simulateMessage(JSON.stringify({ type: "worktrees", worktrees: worktreeData }));
    });

    await waitFor(() => {
      expect(result.current.worktrees).toHaveLength(2);
    });

    expect(result.current.worktrees[0]).toMatchObject({ id: "wt-1", name: "feature-a" });
    expect(result.current.worktrees[1]).toMatchObject({ id: "wt-2", name: "feature-b" });
  });

  it("dispatches custom activity window event on SSE activity message", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    renderHook(() => useWorktrees());

    await waitFor(() => {
      expect((globalThis.EventSource as any).instances.length).toBeGreaterThan(0);
    });

    const es = (globalThis.EventSource as any).instances[0];
    const activityEvent = { type: "commit", message: "test commit" };

    act(() => {
      es.simulateMessage(JSON.stringify({ type: "activity", event: activityEvent }));
    });

    const customEvent = dispatchSpy.mock.calls.find(
      ([evt]) => evt instanceof CustomEvent && evt.type === "OpenKit:activity",
    );
    expect(customEvent).toBeDefined();
    expect((customEvent![0] as CustomEvent).detail).toEqual(activityEvent);

    dispatchSpy.mockRestore();
  });

  it("dispatches custom activity-history window event on SSE activity-history message", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    renderHook(() => useWorktrees());

    await waitFor(() => {
      expect((globalThis.EventSource as any).instances.length).toBeGreaterThan(0);
    });

    const es = (globalThis.EventSource as any).instances[0];
    const events = [
      { type: "commit", message: "first" },
      { type: "commit", message: "second" },
    ];

    act(() => {
      es.simulateMessage(JSON.stringify({ type: "activity-history", events }));
    });

    const customEvent = dispatchSpy.mock.calls.find(
      ([evt]) => evt instanceof CustomEvent && evt.type === "OpenKit:activity-history",
    );
    expect(customEvent).toBeDefined();
    expect((customEvent![0] as CustomEvent).detail).toEqual(events);

    dispatchSpy.mockRestore();
  });

  it("sets isConnected to true on EventSource open", async () => {
    const { result } = renderHook(() => useWorktrees());

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
  });

  it("cleans up EventSource on unmount", async () => {
    const { unmount } = renderHook(() => useWorktrees());

    await waitFor(() => {
      expect((globalThis.EventSource as any).instances.length).toBeGreaterThan(0);
    });

    const es = (globalThis.EventSource as any).instances[0];

    unmount();

    expect(es.readyState).toBe(2);
  });

  it("invokes notification callback on SSE notification message", async () => {
    const onNotification = vi.fn();
    renderHook(() => useWorktrees(onNotification));

    await waitFor(() => {
      expect((globalThis.EventSource as any).instances.length).toBeGreaterThan(0);
    });

    const es = (globalThis.EventSource as any).instances[0];

    act(() => {
      es.simulateMessage(
        JSON.stringify({ type: "notification", message: "Build failed", level: "error" }),
      );
    });

    expect(onNotification).toHaveBeenCalledWith("Build failed", "error");
  });

  it("invokes hook-update callback on SSE hook-update message", async () => {
    const onHookUpdate = vi.fn();
    renderHook(() => useWorktrees(undefined, onHookUpdate));

    await waitFor(() => {
      expect((globalThis.EventSource as any).instances.length).toBeGreaterThan(0);
    });

    const es = (globalThis.EventSource as any).instances[0];

    act(() => {
      es.simulateMessage(JSON.stringify({ type: "hook-update", worktreeId: "wt-123" }));
    });

    expect(onHookUpdate).toHaveBeenCalledWith("wt-123");
  });

  it("does not create EventSource when serverUrl is null", () => {
    mockServerUrl = null;
    renderHook(() => useWorktrees());

    expect((globalThis.EventSource as any).instances).toHaveLength(0);
  });
});
