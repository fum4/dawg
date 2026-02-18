import { AnimatePresence, motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useActivityFeed } from "../hooks/useActivityFeed";
import { ActivityBell, ActivityFeed } from "./ActivityFeed";
import type { View } from "./NavBar";
import { nav } from "../theme";

const tabs: { id: View; label: string }[] = [
  { id: "workspace", label: "Workspace" },
  { id: "agents", label: "Agents" },
  { id: "hooks", label: "Hooks" },
  { id: "integrations", label: "Integrations" },
  { id: "configuration", label: "Settings" },
];

interface HeaderProps {
  activeView: View;
  onChangeView: (view: View) => void;
  onNavigateToWorktree?: (target: {
    worktreeId: string;
    projectName?: string;
    sourceServerUrl?: string;
  }) => void;
}

const USER_INPUT_HINT =
  /\b(approve|approval|confirm|confirmation|yes\/no|y\/n|permission|authorize|authorise|need your|need you|waiting for (your )?(input|confirmation|approval|answer|response|reply)|user input|blocked|respond|reply)\b/i;

function eventNeedsUserInput(event: {
  category: string;
  type: string;
  severity: string;
  title: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}): boolean {
  if (event.category !== "agent") return false;
  if (event.metadata?.requiresUserAction === true) return true;
  const text = `${event.title} ${event.detail ?? ""}`;
  return USER_INPUT_HINT.test(text);
}

export function Header({ activeView, onChangeView, onNavigateToWorktree }: HeaderProps) {
  const [feedOpen, setFeedOpen] = useState(false);
  const { events, unreadCount, markAllRead, clearAll } = useActivityFeed();
  const [inputBadgeIndex, setInputBadgeIndex] = useState(0);

  const inputRequiredEvents = useMemo(() => {
    const pending = events.filter(eventNeedsUserInput);
    const latestByContext = new Map<string, (typeof pending)[number]>();

    for (const event of pending) {
      const key = `${event.projectName ?? "unknown-project"}::${event.worktreeId ?? "unknown-worktree"}`;
      const existing = latestByContext.get(key);
      if (
        !existing ||
        new Date(event.timestamp).getTime() > new Date(existing.timestamp).getTime()
      ) {
        latestByContext.set(key, event);
      }
    }

    return [...latestByContext.values()].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [events]);

  useEffect(() => {
    if (inputRequiredEvents.length === 0) {
      setInputBadgeIndex(0);
      return;
    }
    setInputBadgeIndex((prev) => prev % inputRequiredEvents.length);
  }, [inputRequiredEvents.length]);

  useEffect(() => {
    if (inputRequiredEvents.length <= 1) return;
    const timer = setInterval(() => {
      setInputBadgeIndex((prev) => (prev + 1) % inputRequiredEvents.length);
    }, 2500);
    return () => clearInterval(timer);
  }, [inputRequiredEvents.length]);

  const activeInputRequired = inputRequiredEvents[inputBadgeIndex] ?? null;
  const activeInputProject = activeInputRequired?.projectName ?? "Unknown project";
  const activeInputWorktree = activeInputRequired?.worktreeId ?? "No worktree";

  const openFeed = () => {
    setFeedOpen(true);
    setTimeout(() => markAllRead(), 500);
  };

  const handleToggleFeed = () => {
    setFeedOpen((prev) => {
      if (!prev) {
        setTimeout(() => markAllRead(), 500);
      }
      return !prev;
    });
  };

  return (
    <header
      className="h-[4.25rem] flex-shrink-0 relative bg-[#0c0e12]/60 backdrop-blur-md z-40"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Center: nav tabs */}
      <div
        className="absolute inset-x-0 bottom-[1.375rem] flex justify-center"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <div className="flex items-center gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onChangeView(t.id)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors duration-150 ${
                activeView === t.id ? nav.active : nav.inactive
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Right: activity bell */}
      <div
        className="absolute right-4 bottom-[1.375rem] flex items-center"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          <AnimatePresence mode="wait" initial={false}>
            {activeInputRequired && (
              <motion.button
                key={`${activeInputRequired.id}:${inputBadgeIndex}`}
                type="button"
                onClick={openFeed}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="h-7 max-w-[360px] px-2.5 rounded-md border border-yellow-400/25 bg-yellow-400/10 text-[10px] text-yellow-300/90 hover:text-yellow-200 hover:bg-yellow-400/15 transition-colors duration-150 inline-flex items-center gap-1.5"
                title={`${activeInputRequired.title} (${activeInputProject} • ${activeInputWorktree})`}
              >
                <motion.span
                  className="w-1.5 h-1.5 rounded-full bg-yellow-300 flex-shrink-0"
                  animate={{ opacity: [0.55, 1, 0.55] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
                <Sparkles className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">
                  Input needed · {activeInputProject} · {activeInputWorktree}
                </span>
              </motion.button>
            )}
          </AnimatePresence>

          <div className="relative">
            <ActivityBell unreadCount={unreadCount} isOpen={feedOpen} onClick={handleToggleFeed} />
            <AnimatePresence>
              {feedOpen && (
                <ActivityFeed
                  events={events}
                  unreadCount={unreadCount}
                  onMarkAllRead={markAllRead}
                  onClearAll={clearAll}
                  onClose={() => setFeedOpen(false)}
                  onNavigateToWorktree={onNavigateToWorktree}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
