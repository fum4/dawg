import { useState } from "react";

import { text } from "../theme";
import { Modal } from "./Modal";
import { Spinner } from "./Spinner";

interface DeployScope {
  key: string;
  label: string;
  active: boolean;
}

interface DeployDialogProps {
  title: string;
  icon?: React.ReactNode;
  scopes: DeployScope[];
  mutuallyExclusive?: boolean;
  warning?: (draft: Record<string, boolean>) => string | null;
  onApply: (desired: Record<string, boolean>) => Promise<void>;
  onClose: () => void;
}

export function DeployDialog({
  title,
  icon,
  scopes,
  mutuallyExclusive,
  warning,
  onApply,
  onClose,
}: DeployDialogProps) {
  const [draft, setDraft] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(scopes.map((s) => [s.key, s.active])),
  );
  const [applying, setApplying] = useState(false);

  const hasChanges = scopes.some((s) => draft[s.key] !== s.active);
  const warningText = warning?.(draft) ?? null;

  const handleToggle = (key: string) => {
    setDraft((prev) => {
      const next = { ...prev };
      const newValue = !next[key];
      next[key] = newValue;
      if (mutuallyExclusive && newValue) {
        for (const s of scopes) {
          if (s.key !== key) next[s.key] = false;
        }
      }
      return next;
    });
  };

  const handleApply = async () => {
    setApplying(true);
    await onApply(draft);
    setApplying(false);
    onClose();
  };

  return (
    <Modal
      title={title}
      icon={icon}
      width="sm"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1.5 text-xs rounded-lg ${text.muted} hover:${text.secondary} transition-colors`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!hasChanges || applying}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              hasChanges && !applying
                ? warningText
                  ? "text-amber-400 bg-amber-900/30 hover:bg-amber-900/50"
                  : "text-teal-400 bg-teal-900/30 hover:bg-teal-900/50"
                : "text-white/20 bg-white/[0.04] cursor-not-allowed"
            }`}
          >
            {applying ? <Spinner size="xs" className="text-teal-400" /> : "Apply"}
          </button>
        </div>
      }
    >
      <div className="space-y-1">
        {scopes.map(({ key, label }) => (
          <div
            key={key}
            className={`px-3 py-2 flex items-center justify-between text-xs ${text.secondary} rounded-lg hover:bg-white/[0.04] transition-colors`}
          >
            <span>{label}</span>
            <button
              type="button"
              onClick={() => handleToggle(key)}
              disabled={applying}
              className="relative w-7 h-4 rounded-full transition-colors duration-200 focus:outline-none"
              style={{
                backgroundColor: draft[key] ? "rgba(45,212,191,0.35)" : "rgba(255,255,255,0.08)",
              }}
            >
              <span
                className={`absolute top-0.5 w-3 h-3 rounded-full transition-all duration-200 ${
                  draft[key] ? "left-3.5 bg-teal-400" : "left-0.5 bg-white/40"
                }`}
              />
            </button>
          </div>
        ))}
        {warningText && <p className="px-3 pt-2 text-[11px] text-amber-400/80">{warningText}</p>}
      </div>
    </Modal>
  );
}
