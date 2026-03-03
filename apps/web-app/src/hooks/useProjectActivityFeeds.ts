import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { reportPersistentErrorToast } from "../errorToasts";
import type { Project } from "../contexts/ServerContext";
import { useServer } from "../contexts/ServerContext";
import { type ActivityEvent, getEventsUrl } from "./api";
import {
  replayActivityHistory,
  upsertActivityEvent,
  withSourceServerUrl,
} from "./activityFeedUtils";

const SINGLE_PROJECT_ID = "__single_project__";
const CLEAR_AT_PREFIX = "OpenKit:activityClearedAt:";
const CACHE_PREFIX = "OpenKit:activityFeedCache:";

const SINGLE_PROJECT: Project = {
  id: SINGLE_PROJECT_ID,
  projectDir: ".",
  port: 0,
  name: "Current project",
  status: "running",
};

function resolveProjectServerUrl(project: Project): string | null {
  if (project.id === SINGLE_PROJECT_ID) {
    return null;
  }
  return `http://localhost:${project.port}`;
}

function readClearedAt(serverUrl: string | null): number {
  if (serverUrl === null) return 0;
  try {
    const stored = localStorage.getItem(`${CLEAR_AT_PREFIX}${serverUrl}`);
    const parsed = stored ? Number(stored) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

interface ActivityFeedCachePayload {
  events: ActivityEvent[];
  cachedAt: number;
}

function cacheKey(serverUrl: string | null): string {
  return `${CACHE_PREFIX}${serverUrl ?? "__local__"}`;
}

function readCachedEvents(
  serverUrl: string | null,
  options: { clearedAt: number; disabledEventTypes: Set<string> },
): { hasCache: boolean; events: ActivityEvent[] } {
  try {
    const raw = localStorage.getItem(cacheKey(serverUrl));
    if (!raw) return { hasCache: false, events: [] };
    const parsed = JSON.parse(raw) as ActivityFeedCachePayload;
    const baseEvents = Array.isArray(parsed?.events) ? parsed.events : [];
    const events = baseEvents
      .map((event) => withSourceServerUrl(event, serverUrl))
      .filter((event) => !options.disabledEventTypes.has(event.type))
      .filter((event) => {
        if (options.clearedAt <= 0) return true;
        const eventTime = new Date(event.timestamp).getTime();
        return !Number.isFinite(eventTime) || eventTime > options.clearedAt;
      });
    return { hasCache: true, events };
  } catch {
    return { hasCache: false, events: [] };
  }
}

function writeCachedEvents(serverUrl: string | null, events: ActivityEvent[]): void {
  try {
    const payload: ActivityFeedCachePayload = {
      events,
      cachedAt: Date.now(),
    };
    localStorage.setItem(cacheKey(serverUrl), JSON.stringify(payload));
  } catch (error) {
    reportPersistentErrorToast(error, "Failed to persist activity cache", {
      scope: "project-activity:cache-write",
    });
  }
}

function pruneRecord<T>(
  record: Record<string, T>,
  ids: Set<string>,
  isEqual: (a: T, b: T) => boolean,
): Record<string, T> {
  let changed = false;
  const next: Record<string, T> = {};
  for (const id of ids) {
    if (!(id in record)) continue;
    next[id] = record[id];
  }
  if (Object.keys(record).length !== Object.keys(next).length) {
    changed = true;
  }
  if (!changed) {
    const keys = Object.keys(record);
    if (keys.length !== Object.keys(next).length) {
      changed = true;
    } else {
      for (const key of keys) {
        if (!(key in next)) {
          changed = true;
          break;
        }
        if (!isEqual(record[key], next[key])) {
          changed = true;
          break;
        }
      }
    }
  }
  return changed ? next : record;
}

export interface ProjectActivityFeed {
  project: Project;
  serverUrl: string | null;
  isRunning: boolean;
  isLoading: boolean;
  events: ActivityEvent[];
  unreadCount: number;
  seenEventIds: Set<string>;
  markAllRead: () => void;
  clearAll: () => void;
  markEventsSeen: (eventIds: string[]) => void;
}

export function useProjectActivityFeeds(disabledEventTypes?: string[]) {
  const { projects, activeProject, isElectron } = useServer();
  const [eventsByProjectId, setEventsByProjectId] = useState<Record<string, ActivityEvent[]>>({});
  const [unreadCountByProjectId, setUnreadCountByProjectId] = useState<Record<string, number>>({});
  const [clearedAtByProjectId, setClearedAtByProjectId] = useState<Record<string, number>>({});
  const [seenEventIdsByProjectId, setSeenEventIdsByProjectId] = useState<Record<string, string[]>>(
    {},
  );
  const [isLoadingByProjectId, setIsLoadingByProjectId] = useState<Record<string, boolean>>({});

  const disabledEventTypeSet = useMemo(
    () => new Set(disabledEventTypes ?? []),
    [disabledEventTypes],
  );
  const disabledEventTypeSetRef = useRef(disabledEventTypeSet);
  const clearedAtByProjectIdRef = useRef(clearedAtByProjectId);

  useEffect(() => {
    disabledEventTypeSetRef.current = disabledEventTypeSet;
  }, [disabledEventTypeSet]);

  useEffect(() => {
    clearedAtByProjectIdRef.current = clearedAtByProjectId;
  }, [clearedAtByProjectId]);

  const effectiveProjects = useMemo(() => {
    if (projects.length > 0) return projects;
    if (!isElectron) return [SINGLE_PROJECT];
    return [];
  }, [isElectron, projects]);

  useEffect(() => {
    const projectIds = new Set(effectiveProjects.map((project) => project.id));
    setEventsByProjectId((prev) => pruneRecord(prev, projectIds, (a, b) => a === b));
    setUnreadCountByProjectId((prev) => pruneRecord(prev, projectIds, (a, b) => a === b));
    setSeenEventIdsByProjectId((prev) => pruneRecord(prev, projectIds, (a, b) => a === b));
    setIsLoadingByProjectId((prev) => pruneRecord(prev, projectIds, (a, b) => a === b));
  }, [effectiveProjects]);

  useEffect(() => {
    setClearedAtByProjectId((prev) => {
      const next: Record<string, number> = {};
      for (const project of effectiveProjects) {
        next[project.id] = readClearedAt(resolveProjectServerUrl(project));
      }
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) return next;
      for (const key of nextKeys) {
        if (prev[key] !== next[key]) return next;
      }
      return prev;
    });
  }, [effectiveProjects]);

  useEffect(() => {
    if (!disabledEventTypes || disabledEventTypes.length === 0) return;
    const disabled = new Set(disabledEventTypes);
    setEventsByProjectId((prev) => {
      let changed = false;
      const next: Record<string, ActivityEvent[]> = {};
      for (const [projectId, events] of Object.entries(prev)) {
        const filtered = events.filter((event) => !disabled.has(event.type));
        next[projectId] = filtered;
        if (filtered.length !== events.length) {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [disabledEventTypes]);

  useEffect(() => {
    if (effectiveProjects.length === 0) return;
    for (const project of effectiveProjects) {
      const projectEvents = eventsByProjectId[project.id];
      if (!projectEvents) continue;
      writeCachedEvents(resolveProjectServerUrl(project), projectEvents);
    }
  }, [effectiveProjects, eventsByProjectId]);

  const runningTargets = useMemo(
    () =>
      effectiveProjects
        .filter((project) => project.status === "running")
        .map((project) => ({
          projectId: project.id,
          serverUrl: resolveProjectServerUrl(project),
        })),
    [effectiveProjects],
  );

  useEffect(() => {
    if (runningTargets.length === 0) return;

    const eventSources: EventSource[] = [];

    for (const target of runningTargets) {
      const cached = readCachedEvents(target.serverUrl, {
        clearedAt: clearedAtByProjectIdRef.current[target.projectId] ?? 0,
        disabledEventTypes: disabledEventTypeSetRef.current,
      });
      if (cached.hasCache) {
        setEventsByProjectId((prev) => {
          const current = prev[target.projectId] ?? [];
          if (current.length > 0) return prev;
          return {
            ...prev,
            [target.projectId]: cached.events,
          };
        });
      }
      setIsLoadingByProjectId((prev) => {
        const current = prev[target.projectId];
        const nextLoading = cached.hasCache ? false : (current ?? true);
        if (current === nextLoading) return prev;
        return {
          ...prev,
          [target.projectId]: nextLoading,
        };
      });

      const eventSource = new EventSource(getEventsUrl(target.serverUrl));
      eventSource.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data);

          if (data.type === "activity") {
            setIsLoadingByProjectId((prev) => {
              if (prev[target.projectId] === false) return prev;
              return {
                ...prev,
                [target.projectId]: false,
              };
            });
            const incoming = withSourceServerUrl(data.event as ActivityEvent, target.serverUrl);
            if (disabledEventTypeSetRef.current.has(incoming.type)) return;

            const eventTime = new Date(incoming.timestamp).getTime();
            const clearedAt = clearedAtByProjectIdRef.current[target.projectId] ?? 0;
            if (clearedAt > 0 && Number.isFinite(eventTime) && eventTime <= clearedAt) return;

            setEventsByProjectId((prev) => {
              const current = prev[target.projectId] ?? [];
              const nextEvents = upsertActivityEvent(current, incoming);
              if (nextEvents === current) return prev;
              return {
                ...prev,
                [target.projectId]: nextEvents,
              };
            });
            setUnreadCountByProjectId((prev) => ({
              ...prev,
              [target.projectId]: (prev[target.projectId] ?? 0) + 1,
            }));
            return;
          }

          if (data.type === "activity-history") {
            setIsLoadingByProjectId((prev) => {
              if (prev[target.projectId] === false) return prev;
              return {
                ...prev,
                [target.projectId]: false,
              };
            });
            const history = Array.isArray(data.events) ? (data.events as ActivityEvent[]) : [];
            if (history.length === 0) return;

            const clearedAt = clearedAtByProjectIdRef.current[target.projectId] ?? 0;
            const filteredHistory =
              clearedAt > 0
                ? history.filter((event) => {
                    const eventTime = new Date(event.timestamp).getTime();
                    return (
                      (!Number.isFinite(eventTime) || eventTime > clearedAt) &&
                      !disabledEventTypeSetRef.current.has(event.type)
                    );
                  })
                : history.filter((event) => !disabledEventTypeSetRef.current.has(event.type));
            if (filteredHistory.length === 0) return;

            const scopedHistory = filteredHistory.map((event) =>
              withSourceServerUrl(event, target.serverUrl),
            );

            setEventsByProjectId((prev) => {
              const current = prev[target.projectId] ?? [];
              const nextEvents = replayActivityHistory(current, scopedHistory);
              if (nextEvents === current) return prev;
              return {
                ...prev,
                [target.projectId]: nextEvents,
              };
            });
          }
        } catch {
          // Ignore malformed stream events.
        }
      };
      eventSource.onerror = () => {
        setIsLoadingByProjectId((prev) => {
          if (prev[target.projectId] === false) return prev;
          return {
            ...prev,
            [target.projectId]: false,
          };
        });
      };

      eventSources.push(eventSource);
    }

    return () => {
      for (const source of eventSources) {
        source.close();
      }
    };
  }, [runningTargets]);

  const markAllReadForProject = useCallback((projectId: string) => {
    setUnreadCountByProjectId((prev) => {
      if ((prev[projectId] ?? 0) === 0) return prev;
      return {
        ...prev,
        [projectId]: 0,
      };
    });
  }, []);

  const clearAllForProject = useCallback((projectId: string, serverUrl: string | null) => {
    const now = Date.now();
    setEventsByProjectId((prev) => ({
      ...prev,
      [projectId]: [],
    }));
    setUnreadCountByProjectId((prev) => ({
      ...prev,
      [projectId]: 0,
    }));
    setSeenEventIdsByProjectId((prev) => ({
      ...prev,
      [projectId]: [],
    }));
    setClearedAtByProjectId((prev) => ({
      ...prev,
      [projectId]: now,
    }));
    if (serverUrl !== null) {
      try {
        localStorage.setItem(`${CLEAR_AT_PREFIX}${serverUrl}`, String(now));
      } catch (error) {
        reportPersistentErrorToast(error, "Failed to persist project activity clear state", {
          scope: "project-activity:clear-localstorage",
        });
      }
    }
    writeCachedEvents(serverUrl, []);
  }, []);

  const markEventsSeenForProject = useCallback((projectId: string, eventIds: string[]) => {
    if (eventIds.length === 0) return;
    setSeenEventIdsByProjectId((prev) => {
      const existing = prev[projectId] ?? [];
      const seen = new Set(existing);
      let changed = false;
      for (const eventId of eventIds) {
        if (!seen.has(eventId)) {
          seen.add(eventId);
          changed = true;
        }
      }
      if (!changed) return prev;
      return {
        ...prev,
        [projectId]: [...seen],
      };
    });
  }, []);

  const orderedProjects = useMemo(() => {
    if (!activeProject) return effectiveProjects;
    const activeIndex = effectiveProjects.findIndex((project) => project.id === activeProject.id);
    if (activeIndex <= 0) return effectiveProjects;
    return [
      effectiveProjects[activeIndex],
      ...effectiveProjects.slice(0, activeIndex),
      ...effectiveProjects.slice(activeIndex + 1),
    ];
  }, [activeProject, effectiveProjects]);

  const projectFeeds = useMemo<ProjectActivityFeed[]>(
    () =>
      orderedProjects.map((project) => {
        const serverUrl = resolveProjectServerUrl(project);
        return {
          project,
          serverUrl,
          isRunning: project.status === "running",
          isLoading:
            project.status === "running" ? (isLoadingByProjectId[project.id] ?? true) : false,
          events: eventsByProjectId[project.id] ?? [],
          unreadCount: unreadCountByProjectId[project.id] ?? 0,
          seenEventIds: new Set(seenEventIdsByProjectId[project.id] ?? []),
          markAllRead: () => markAllReadForProject(project.id),
          clearAll: () => clearAllForProject(project.id, serverUrl),
          markEventsSeen: (eventIds: string[]) => markEventsSeenForProject(project.id, eventIds),
        };
      }),
    [
      clearAllForProject,
      eventsByProjectId,
      markAllReadForProject,
      markEventsSeenForProject,
      orderedProjects,
      isLoadingByProjectId,
      seenEventIdsByProjectId,
      unreadCountByProjectId,
    ],
  );

  return {
    feeds: projectFeeds,
  };
}
