import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";

import { border, text } from "../theme";

interface SidebarConfigBarProps {
  items: Array<{
    label: string;
    checked: boolean;
    onToggle: () => void;
  }>;
}

export function SidebarConfigBar({ items }: SidebarConfigBarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className={`flex-shrink-0 border-t ${border.subtle} px-2 py-2`}>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`p-1 rounded transition-colors duration-150 ${
            open
              ? `${text.secondary} bg-white/[0.06]`
              : `${text.dimmed} hover:${text.secondary} hover:bg-white/[0.06]`
          }`}
        >
          <Settings className="w-[18px] h-[18px]" />
        </button>

        {open && (
          <div className="absolute bottom-full left-0 mb-1 w-44 rounded-lg bg-[#1a1d24] border border-white/[0.08] shadow-xl py-1 z-50">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onToggle}
                className={`w-full px-3 py-1.5 flex items-center gap-2 text-left text-[11px] ${text.secondary} hover:bg-white/[0.04] transition-colors duration-150`}
              >
                <span
                  className={`w-3 h-3 rounded border flex items-center justify-center flex-shrink-0 ${
                    item.checked ? "bg-accent/20 border-accent/40" : "border-white/[0.15]"
                  }`}
                >
                  {item.checked && (
                    <svg
                      className="w-2 h-2 text-accent"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 6l3 3 5-5" />
                    </svg>
                  )}
                </span>
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
