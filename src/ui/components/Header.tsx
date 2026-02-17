import { AnimatePresence } from "motion/react";
import { useCallback, useState } from "react";

import { useActivityFeed } from "../hooks/useActivityFeed";
import { useConfig } from "../hooks/useConfig";
import { useToast } from "../contexts/ToastContext";
import type { ToastChild } from "../contexts/ToastContext";
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
  onNavigateToWorktree?: (worktreeId: string) => void;
}

export function Header({ activeView, onChangeView, onNavigateToWorktree }: HeaderProps) {
  const { addToast, upsertToast, upsertGroupedToast } = useToast();
  const { config } = useConfig();
  const [feedOpen, setFeedOpen] = useState(false);

  const handleToast = useCallback(
    (
      message: string,
      level: "error" | "info" | "success",
      projectName?: string,
      worktreeId?: string,
    ) => addToast(message, level, projectName, worktreeId),
    [addToast],
  );

  const handleUpsertToast = useCallback(
    (
      groupKey: string,
      message: string,
      level: "error" | "info" | "success",
      isLoading: boolean,
      projectName?: string,
      worktreeId?: string,
    ) => upsertToast(groupKey, message, level, isLoading, projectName, worktreeId),
    [upsertToast],
  );

  const handleUpsertGroupedToast = useCallback(
    (groupKey: string, child: ToastChild, projectName?: string, worktreeId?: string) =>
      upsertGroupedToast(groupKey, child, projectName, worktreeId),
    [upsertGroupedToast],
  );

  const { events, unreadCount, filter, setFilter, markAllRead, clearAll } = useActivityFeed(
    handleToast,
    handleUpsertToast,
    config?.activity?.toastEvents,
    handleUpsertGroupedToast,
  );

  const handleToggleFeed = () => {
    if (!feedOpen) {
      // Opening — mark as read after a short delay
      setTimeout(() => markAllRead(), 500);
    }
    setFeedOpen(!feedOpen);
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
        <div className="relative">
          <ActivityBell unreadCount={unreadCount} isOpen={feedOpen} onClick={handleToggleFeed} />
          <AnimatePresence>
            {feedOpen && (
              <ActivityFeed
                events={events}
                unreadCount={unreadCount}
                filter={filter}
                onFilterChange={setFilter}
                onMarkAllRead={markAllRead}
                onClearAll={clearAll}
                onClose={() => setFeedOpen(false)}
                onNavigateToWorktree={onNavigateToWorktree}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
