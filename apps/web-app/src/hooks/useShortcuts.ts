import { useEffect } from "react";

import {
  type ShortcutAction,
  type ShortcutBinding,
  type ShortcutEvent,
  matchesEvent,
  matchesProjectTab,
  resolveBindings,
} from "../shortcuts";

interface UseShortcutsOptions {
  shortcuts: Record<string, string> | undefined;
  onAction: (event: ShortcutEvent) => void;
  arrowNavEnabled?: boolean;
  enabled?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (target.closest(".monaco-editor")) return true;
  return false;
}

function isModalOpen(): boolean {
  return document.querySelector("[data-modal-open]") !== null;
}

export function useShortcuts({
  shortcuts,
  onAction,
  arrowNavEnabled = true,
  enabled = true,
}: UseShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const bindings = resolveBindings(shortcuts);

    function handleKeyDown(event: KeyboardEvent) {
      if (isModalOpen()) return;

      // Arrow navigation (Cmd+Arrow) — works even when focus is in search
      if (arrowNavEnabled && event.metaKey && !event.shiftKey && !event.altKey) {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          // Don't intercept if user is text-editing, unless it's the sidebar search
          if (isEditableTarget(event.target)) {
            const el = event.target as HTMLElement;
            if (!el.hasAttribute("data-sidebar-search")) return;
          }
          event.preventDefault();
          event.stopPropagation();
          onAction({
            action: "arrow-nav",
            direction: event.key === "ArrowLeft" ? "left" : "right",
          });
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          onAction({
            action: "arrow-nav-vertical",
            direction: event.key === "ArrowDown" ? "down" : "up",
          });
          return;
        }
      }

      if (isEditableTarget(event.target)) return;

      // Check project-tab first (modifier + digit)
      const projectTabBinding = bindings["project-tab"];
      if (projectTabBinding) {
        const tabIndex = matchesProjectTab(projectTabBinding, event);
        if (tabIndex >= 0) {
          event.preventDefault();
          event.stopPropagation();
          onAction({ action: "project-tab", tabIndex });
          return;
        }
      }

      // Check regular shortcuts
      const entries = Object.entries(bindings) as [ShortcutAction, ShortcutBinding][];
      for (const [action, binding] of entries) {
        if (action === "project-tab") continue;
        if (matchesEvent(binding, event)) {
          event.preventDefault();
          event.stopPropagation();
          onAction({ action });
          return;
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [shortcuts, onAction, arrowNavEnabled, enabled]);
}
