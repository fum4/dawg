import { useCallback, useEffect, useState } from "react";

import { reportPersistentErrorToast } from "../errorToasts";
import type { ActivityEvent } from "./api";
import {
  isHookRelatedEvent,
  replayActivityHistory,
  upsertActivityEvent,
  withSourceServerUrl,
} from "./activityFeedUtils";
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

export type { HookFeedItem } from "./activityFeedUtils";

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
  disabledEventTypes?: string[],
) {
  const serverUrl = useServerUrlOptional();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [clearedAt, setClearedAt] = useState<number>(() => {
    if (serverUrl === null) return 0;
    try {
      const stored = localStorage.getItem(`OpenKit:activityClearedAt:${serverUrl}`);
      const parsed = stored ? Number(stored) : 0;
      return Number.isFinite(parsed) ? parsed : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    if (serverUrl === null) {
      setClearedAt(0);
      return;
    }
    try {
      const stored = localStorage.getItem(`OpenKit:activityClearedAt:${serverUrl}`);
      const parsed = stored ? Number(stored) : 0;
      setClearedAt(Number.isFinite(parsed) ? parsed : 0);
    } catch {
      setClearedAt(0);
    }
  }, [serverUrl]);

  useEffect(() => {
    if (serverUrl === null) {
      setEvents([]);
      setUnreadCount(0);
      return;
    }

    const handler = (e: CustomEvent<ActivityEvent>) => {
      const event = withSourceServerUrl(e.detail, serverUrl);
      if ((disabledEventTypes ?? []).includes(event.type)) return;
      const eventTime = new Date(event.timestamp).getTime();
      if (clearedAt > 0 && Number.isFinite(eventTime) && eventTime <= clearedAt) return;

      setEvents((prev) => upsertActivityEvent(prev, event));
      setUnreadCount((c) => c + 1);

      if (isHookRelatedEvent(event)) return;

      const activeToastEvents = toastEvents ?? DEFAULT_TOAST_EVENTS;
      if (activeToastEvents.includes(event.type)) {
        const level =
          event.severity === "error" ? "error" : event.severity === "success" ? "success" : "info";
        const isLoading = event.type.endsWith("_started");
        if (event.groupKey && onUpsertToast) {
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
      const filteredHistory =
        clearedAt > 0
          ? e.detail.filter((event) => {
              const eventTime = new Date(event.timestamp).getTime();
              return (
                (!Number.isFinite(eventTime) || eventTime > clearedAt) &&
                !(disabledEventTypes ?? []).includes(event.type)
              );
            })
          : e.detail.filter((event) => !(disabledEventTypes ?? []).includes(event.type));
      if (filteredHistory.length === 0) return;
      const scopedHistory = filteredHistory.map((event) => withSourceServerUrl(event, serverUrl));
      setEvents((prev) => replayActivityHistory(prev, scopedHistory));
    };

    window.addEventListener("OpenKit:activity", handler as EventListener);
    window.addEventListener("OpenKit:activity-history", historyHandler as EventListener);

    return () => {
      window.removeEventListener("OpenKit:activity", handler as EventListener);
      window.removeEventListener("OpenKit:activity-history", historyHandler as EventListener);
    };
  }, [serverUrl, onToast, onUpsertToast, toastEvents, clearedAt, disabledEventTypes]);

  useEffect(() => {
    if (!disabledEventTypes || disabledEventTypes.length === 0) return;
    const disabled = new Set(disabledEventTypes);
    setEvents((prev) => prev.filter((event) => !disabled.has(event.type)));
  }, [disabledEventTypes]);

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const clearAll = useCallback(() => {
    const now = Date.now();
    setEvents([]);
    setUnreadCount(0);
    setClearedAt(now);
    if (serverUrl !== null) {
      try {
        localStorage.setItem(`OpenKit:activityClearedAt:${serverUrl}`, String(now));
      } catch (error) {
        reportPersistentErrorToast(error, "Failed to persist activity clear state", {
          scope: "activity-feed:localstorage",
        });
      }
    }
  }, [serverUrl]);

  return {
    events,
    unreadCount,
    markAllRead,
    clearAll,
  };
}
