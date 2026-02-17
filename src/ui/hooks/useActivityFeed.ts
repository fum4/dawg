import { useCallback, useEffect, useRef, useState } from "react";

import type { ActivityEvent } from "./api";
import type { ToastChild } from "../contexts/ToastContext";
import { useServerUrlOptional } from "../contexts/ServerContext";

const DEFAULT_TOAST_EVENTS = [
  "creation_started",
  "creation_completed",
  "creation_failed",
  "skill_started",
  "skill_completed",
  "skill_failed",
  "crashed",
  "connection_lost",
];

export type ActivityCategory = "agent" | "worktree" | "system";

export function useActivityFeed(
  onToast?: (
    message: string,
    level: "error" | "info" | "success",
    projectName?: string,
    worktreeId?: string,
  ) => void,
  onUpsertToast?: (
    groupKey: string,
    message: string,
    level: "error" | "info" | "success",
    isLoading: boolean,
    projectName?: string,
    worktreeId?: string,
  ) => void,
  toastEvents?: string[],
  onUpsertGroupedToast?: (
    groupKey: string,
    child: ToastChild,
    projectName?: string,
    worktreeId?: string,
  ) => void,
) {
  const serverUrl = useServerUrlOptional();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<ActivityCategory | null>(null);
  const lastReadTimestamp = useRef<string | null>(null);

  // Listen for SSE activity events — these come through the existing EventSource in useWorktrees
  // We need a separate listener registration approach
  useEffect(() => {
    if (serverUrl === null) {
      setEvents([]);
      setUnreadCount(0);
      return;
    }

    // We use a custom event listener pattern — subscribe to a global event bus
    const handler = (e: CustomEvent<ActivityEvent>) => {
      const event = e.detail;
      setEvents((prev) => {
        // Replace event with same groupKey, or avoid duplicates by id
        if (event.groupKey) {
          const groupIndex = prev.findIndex((p) => p.groupKey === event.groupKey);
          if (groupIndex >= 0) {
            const updated = [...prev];
            updated[groupIndex] = event;
            return updated;
          }
        }
        if (prev.some((p) => p.id === event.id)) return prev;
        const updated = [event, ...prev].slice(0, 200); // Keep last 200
        return updated;
      });
      setUnreadCount((c) => c + 1);

      // Fire toast for important events
      const activeToastEvents = toastEvents ?? DEFAULT_TOAST_EVENTS;
      if (activeToastEvents.includes(event.type)) {
        const level =
          event.severity === "error" ? "error" : event.severity === "success" ? "success" : "info";
        const isLoading = event.type.endsWith("_started");

        // Route skill events to grouped toasts
        const isSkillEvent =
          event.type === "skill_started" ||
          event.type === "skill_completed" ||
          event.type === "skill_failed";
        if (isSkillEvent && onUpsertGroupedToast && event.groupKey && event.metadata?.skillName) {
          const skillName = event.metadata.skillName as string;
          const status: ToastChild["status"] = isLoading
            ? "loading"
            : event.severity === "error"
              ? "error"
              : "success";
          const childMessage = isLoading
            ? `${skillName}: running...`
            : event.severity === "error"
              ? `${skillName}: failed`
              : `${skillName}: passed`;
          onUpsertGroupedToast(
            event.groupKey,
            {
              key: skillName,
              message: childMessage,
              status,
              filePath: event.metadata.filePath as string | undefined,
            },
            event.projectName,
            event.worktreeId,
          );
        } else if (event.groupKey && onUpsertToast) {
          onUpsertToast(
            event.groupKey,
            event.title,
            level,
            isLoading,
            event.projectName,
            event.worktreeId,
          );
        } else if (onToast) {
          onToast(event.title, level, event.projectName, event.worktreeId);
        }
      }
    };

    const historyHandler = (e: CustomEvent<ActivityEvent[]>) => {
      setEvents((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        const newEvents = e.detail.filter((ev) => !ids.has(ev.id));
        return [...prev, ...newEvents]
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 200);
      });
    };

    window.addEventListener("dawg:activity", handler as EventListener);
    window.addEventListener("dawg:activity-history", historyHandler as EventListener);

    return () => {
      window.removeEventListener("dawg:activity", handler as EventListener);
      window.removeEventListener("dawg:activity-history", historyHandler as EventListener);
    };
  }, [serverUrl, onToast, onUpsertToast, onUpsertGroupedToast, toastEvents]);

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
    if (events.length > 0) {
      lastReadTimestamp.current = events[0].timestamp;
    }
  }, [events]);

  const clearAll = useCallback(() => {
    setEvents([]);
    setUnreadCount(0);
  }, []);

  const filteredEvents = filter ? events.filter((e) => e.category === filter) : events;

  return {
    events: filteredEvents,
    allEvents: events,
    unreadCount,
    filter,
    setFilter,
    markAllRead,
    clearAll,
  };
}
