// src/context/WebSocketContext.js
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

const WebSocketContext = createContext(null);

const STATE_WAITING = 'WAITING';

export function WebSocketProvider({ children }) {
  const [websocket, setWebsocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastMessage, setLastMessage] = useState(null);

  const [repCount, setRepCount] = useState(0);
  const [currentState, setCurrentState] = useState(STATE_WAITING);
  const [isRecording, setIsRecording] = useState(false);
  const [gyroFilt, setGyroFilt] = useState(0);

  // NEW: surface errors to UI
  const [lastError, setLastError] = useState(null); // { msg, ts, raw }

  const wsRef = useRef(null);
  const repCountRef = useRef(0);

  // Debounce identical error spam
  const lastErrorSigRef = useRef({ sig: null, ts: 0 });

  useEffect(() => {
    repCountRef.current = repCount;
  }, [repCount]);

  const closeSocket = (ws, reason = 'replacing socket') => {
    if (!ws) return;
    try {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, reason);
      }
    } catch (_) {}
  };

  const extractReps = (data) => {
    const v =
      data?.reps ??
      data?.repCount ??
      data?.rep_count ??
      data?.total_reps ??
      data?.count ??
      data?.payload?.reps ??
      data?.payload?.rep_count;

    if (v === undefined || v === null) return undefined;
    const n = typeof v === 'string' ? Number(v) : v;
    return Number.isFinite(n) ? n : undefined;
  };

  const normalizeError = (data) => {
    // Try common fields a server might send
    const msg =
      data?.message ??
      data?.error ??
      data?.detail ??
      data?.reason ??
      (typeof data === 'string' ? data : null) ??
      'Unknown server error';

    // Signature used to debounce repeats
    const sig = JSON.stringify({
      type: data?.type ?? 'error',
      msg,
      code: data?.code ?? null,
    });

    return { msg, sig };
  };

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      setLastMessage(data);

      const nextReps = extractReps(data);

      console.log('📨 WS recv:', data.type || 'unknown', {
        action: data.action,
        recording: data.recording,
        reps: nextReps,
        state: data.state,
        gyro_filt: data.gyro_filt,
      });

      // ✅ Handle server error messages explicitly
      if (data.type === 'error') {
        const { msg, sig } = normalizeError(data);

        const now = Date.now();
        const { sig: lastSig, ts: lastTs } = lastErrorSigRef.current;

        // Debounce: only surface same error once per 2 seconds
        if (sig !== lastSig || now - lastTs > 2000) {
          lastErrorSigRef.current = { sig, ts: now };
          console.warn('🧯 Server error message:', data);
          setLastError({ msg, ts: now, raw: data });
        }

        // Do not update other state from error packets
        return;
      }

      // SERVER SOURCE OF TRUTH
      if (data.recording !== undefined) setIsRecording(!!data.recording);

      if (nextReps !== undefined) {
        repCountRef.current = nextReps;
        setRepCount(nextReps);
      }
      if (data.state !== undefined) setCurrentState(data.state);
      if (data.gyro_filt !== undefined) setGyroFilt(data.gyro_filt);

      if (data.type === 'ack') {
        console.log('✅ ACK:', data.action, data);
        // do NOT set recording manually
      }
    } catch (err) {
      console.error('Failed to parse WS message:', err, event?.data);
      setLastError({ msg: 'Bad WS payload (JSON parse failed)', ts: Date.now(), raw: event?.data });
    }
  };

  const connect = (ws) => {
    if (!ws) return;

    if (wsRef.current && wsRef.current !== ws) {
      console.log('🔁 Closing old WebSocket before connecting new one');
      closeSocket(wsRef.current, 'reconnect');
      wsRef.current = null;
    }

    if (wsRef.current === ws) {
      console.log('WebSocket already set, reusing connection');
      return;
    }

    wsRef.current = ws;
    setWebsocket(ws);
    setConnectionStatus('connected');

    ws.onmessage = handleMessage;

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('error');
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      setConnectionStatus('disconnected');
      setWebsocket(null);
      wsRef.current = null;
    };
  };

  const disconnect = () => {
    if (wsRef.current) {
      closeSocket(wsRef.current, 'manual disconnect');
      wsRef.current = null;
    }
    setWebsocket(null);
    setConnectionStatus('disconnected');

    setRepCount(0);
    setCurrentState(STATE_WAITING);
    setIsRecording(false);
    setGyroFilt(0);
    setLastError(null);
  };

  const sendMessage = (msg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    console.warn('WebSocket not connected, cannot send:', msg);
    return false;
  };

  const startRecording = () => sendMessage({ type: 'cmd', action: 'start' });
  const stopRecording = () => sendMessage({ type: 'cmd', action: 'stop' });
  const resetReps = () => sendMessage({ type: 'cmd', action: 'reset' });

  const value = useMemo(
    () => ({
      websocket,
      connectionStatus,
      lastMessage,
      lastError, // NEW
      repCount,
      currentState,
      isRecording,
      gyroFilt,
      connect,
      disconnect,
      sendMessage,
      startRecording,
      stopRecording,
      resetReps,
    }),
    [websocket, connectionStatus, lastMessage, lastError, repCount, currentState, isRecording, gyroFilt]
  );

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

export function useWebSocket() {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useWebSocket must be used within WebSocketProvider');
  return ctx;
}
