import { Server, Trash2 } from "lucide-react";

import type { McpServerSummary } from "../types";
import { mcpServer, surface, text } from "../theme";

interface McpServerItemProps {
  server: McpServerSummary;
  isSelected: boolean;
  onSelect: () => void;
  isActive?: boolean;
  onDeploy: () => void;
  onRemove: () => void;
}

export function McpServerItem({
  server,
  isSelected,
  onSelect,
  isActive,
  onDeploy,
  onRemove,
}: McpServerItemProps) {
  const handleDeploy = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDeploy();
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove();
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group w-full text-left px-3 py-3 transition-colors duration-150 border-l-2 ${
        isSelected
          ? `${surface.panelSelected} ${mcpServer.accentBorder}`
          : `border-transparent hover:${surface.panelHover}`
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Server
          className={`w-3.5 h-3.5 flex-shrink-0 transition-colors duration-150 ${isSelected ? "text-purple-400" : `${text.muted} group-hover:text-purple-400`}`}
        />
        <div className="flex-1 min-w-0">
          <span
            className={`text-xs font-medium truncate block ${isSelected ? text.primary : text.secondary}`}
          >
            {server.name}
          </span>
          {server.tags.length > 0 && (
            <div className="flex gap-1">
              {server.tags.slice(0, 3).map((tag) => (
                <span key={tag} className={`text-[10px] ${text.dimmed}`}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Status dot / Actions — fixed-height wrapper prevents reflow on hover */}
        <div className="flex-shrink-0 relative" style={{ width: 52, height: 16 }}>
          <div className="absolute inset-0 flex items-center justify-end group-hover:hidden">
            {isActive && (
              <span
                className={`w-1.5 h-1.5 rounded-full ${mcpServer.deployed} flex-shrink-0 mr-2`}
              />
            )}
          </div>
          <div className="absolute inset-0 hidden group-hover:flex items-center justify-end gap-2.5 mr-[4px]">
            <span
              role="button"
              onClick={handleRemove}
              className="p-0.5 rounded text-white/30 hover:text-red-400 hover:bg-red-400/15 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </span>
            <span
              role="button"
              onClick={handleDeploy}
              className={`relative w-6 h-3.5 rounded-full transition-colors duration-200 cursor-pointer block ${
                isActive ? "bg-teal-400/35" : "bg-white/[0.08]"
              }`}
            >
              <span
                className={`absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all duration-200 ${
                  isActive ? "left-[11px] bg-teal-400" : "left-0.5 bg-white/40"
                }`}
              />
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
