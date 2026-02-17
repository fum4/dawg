import { useCallback, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

import { useTerminal } from "../../hooks/useTerminal";
import { text } from "../../theme";

interface TerminalViewProps {
  worktreeId: string;
  visible: boolean;
}

export function TerminalView({ worktreeId, visible }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const mountedRef = useRef(false);

  const handleData = useCallback((data: string) => {
    terminalRef.current?.write(data);
  }, []);

  const handleExit = useCallback((exitCode: number) => {
    terminalRef.current?.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
  }, []);

  const getSize = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return null;
    return { cols: terminal.cols, rows: terminal.rows };
  }, []);

  const { error, sendData, sendResize, connect, disconnect } = useTerminal({
    worktreeId,
    onData: handleData,
    onExit: handleExit,
    getSize,
  });

  // Initialize xterm and connect on first mount
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#12151a",
        foreground: "#c9d1d9",
        cursor: "#2dd4bf",
        selectionBackground: "rgba(45,212,191,0.20)",
        black: "#484f58",
        red: "#ff7b72",
        green: "#3fb950",
        yellow: "#d29922",
        blue: "#58a6ff",
        magenta: "#bc8cff",
        cyan: "#39c5cf",
        white: "#b1bac4",
        brightBlack: "#6e7681",
        brightRed: "#ffa198",
        brightGreen: "#56d364",
        brightYellow: "#e3b341",
        brightBlue: "#79c0ff",
        brightMagenta: "#d2a8ff",
        brightCyan: "#56d4dd",
        brightWhite: "#f0f6fc",
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    if (containerRef.current) {
      terminal.open(containerRef.current);
      fitAddon.fit();
      connect();
    }

    terminal.onData((data) => {
      sendData(data);
    });

    return () => {
      disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      mountedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle resize when visibility changes or window resizes
  useEffect(() => {
    if (!visible) return;

    const fit = () => {
      if (fitAddonRef.current && containerRef.current) {
        try {
          fitAddonRef.current.fit();
          const terminal = terminalRef.current;
          if (terminal) {
            sendResize(terminal.cols, terminal.rows);
          }
        } catch {
          // container not visible yet
        }
      }
    };

    // Fit and focus after visibility change (needs a frame for DOM layout)
    requestAnimationFrame(() => {
      fit();
      terminalRef.current?.focus();
    });

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(fit);
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [visible, sendResize]);

  if (error) {
    return (
      <div
        className={`flex-1 flex items-center justify-center ${text.error} text-xs`}
        style={{ display: visible ? undefined : "none" }}
      >
        Terminal error: {error}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ display: visible ? undefined : "none" }}>
      <div ref={containerRef} className="flex-1 min-h-0" style={{ padding: "4px 16px 0 16px" }} />
    </div>
  );
}
