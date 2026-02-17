import { useCallback, useEffect, useRef, useState } from "react";

import { createTerminalSession, destroyTerminalSession, getTerminalWsUrl } from "./api";
import { useServerUrlOptional } from "../contexts/ServerContext";

interface UseTerminalOptions {
  worktreeId: string;
  onData?: (data: string) => void;
  onExit?: (exitCode: number) => void;
  getSize?: () => { cols: number; rows: number } | null;
}

interface UseTerminalReturn {
  sessionId: string | null;
  isConnected: boolean;
  error: string | null;
  sendData: (data: string) => void;
  sendResize: (cols: number, rows: number) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useTerminal({
  worktreeId,
  onData,
  onExit,
  getSize,
}: UseTerminalOptions): UseTerminalReturn {
  const serverUrl = useServerUrlOptional();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const connectGenRef = useRef(0);
  const onDataRef = useRef(onData);
  const onExitRef = useRef(onExit);
  const getSizeRef = useRef(getSize);

  onDataRef.current = onData;
  onExitRef.current = onExit;
  getSizeRef.current = getSize;

  const disconnect = useCallback(() => {
    // Invalidate any in-flight connect() that hasn't resolved yet
    connectGenRef.current++;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (sessionIdRef.current) {
      destroyTerminalSession(sessionIdRef.current, serverUrl);
      sessionIdRef.current = null;
    }
    setSessionId(null);
    setIsConnected(false);
  }, [serverUrl]);

  const connect = useCallback(async () => {
    if (serverUrl === null) {
      setError("No active project");
      return;
    }

    disconnect();
    setError(null);

    const gen = connectGenRef.current;

    const size = getSizeRef.current?.();
    lastSizeRef.current = size ?? null;
    const result = await createTerminalSession(worktreeId, size?.cols, size?.rows, serverUrl);

    // Another connect() or disconnect() was called while we were awaiting — abandon
    if (gen !== connectGenRef.current) {
      if (result.success && result.sessionId) {
        destroyTerminalSession(result.sessionId, serverUrl);
      }
      return;
    }

    if (!result.success || !result.sessionId) {
      setError(result.error || "Failed to create terminal session");
      return;
    }

    const sid = result.sessionId;
    sessionIdRef.current = sid;
    setSessionId(sid);

    const ws = new WebSocket(getTerminalWsUrl(sid, serverUrl));
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "exit") {
            onExitRef.current?.(msg.exitCode);
            setIsConnected(false);
            return;
          }
        } catch {
          // Not a control message
        }
        onDataRef.current?.(event.data);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = () => {
      setError("WebSocket connection failed");
      setIsConnected(false);
    };
  }, [worktreeId, disconnect, serverUrl]);

  const sendData = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const last = lastSizeRef.current;
      if (last && last.cols === cols && last.rows === rows) return;
      lastSizeRef.current = { cols, rows };
      wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
    }
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (sessionIdRef.current) {
        destroyTerminalSession(sessionIdRef.current, serverUrl);
        sessionIdRef.current = null;
      }
    };
  }, [serverUrl]);

  return { sessionId, isConnected, error, sendData, sendResize, connect, disconnect };
}
