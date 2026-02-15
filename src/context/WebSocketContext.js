import React, { createContext, useContext, useRef, useState } from 'react';

const WebSocketContext = createContext(null);
const AUTO_LIFT_CONFIDENCE_MIN = 0.55;
const AUTO_LIFT_STABLE_HITS = 3;
const AUTO_LIFT_HOLD_MS = 2500;

const DEFAULT_DETECTED_LIFT = {
  label: null,
  confidence: 0,
  isActive: false,
  isManual: false,
  status: 'idle',
};

export function WebSocketProvider({ children }) {
  const [websocket, setWebsocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastMessage, setLastMessage] = useState(null);
  const [repCount, setRepCount] = useState(0);
  const [currentState, setCurrentState] = useState('WAITING');
  const [isRecording, setIsRecording] = useState(false);
  const [gyroFilt, setGyroFilt] = useState(0);
  const [repEvents, setRepEvents] = useState([]);
  const [lastRepEvent, setLastRepEvent] = useState(null);
  const [currentSessionSummary, setCurrentSessionSummary] = useState(null);

  const [detectedLift, setDetectedLift] = useState(DEFAULT_DETECTED_LIFT);
  const [piIp, setPiIp] = useState(null);

  const [sessionsList, setSessionsList] = useState(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSessionSummary, setSelectedSessionSummary] = useState(null);
  const [selectedSessionLoading, setSelectedSessionLoading] = useState(false);
  const [selectedSessionRawPoints, setSelectedSessionRawPoints] = useState(null);
  const [selectedSessionRawLoading, setSelectedSessionRawLoading] = useState(false);
  const [exportResult, setExportResult] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);

  const wsRef = useRef(null);
  const manualLiftRef = useRef(null);
  const autoLiftRef = useRef({
    candidate: null,
    candidateHits: 0,
    stableLabel: null,
    stableConfidence: 0,
    stableAt: 0,
  });

  const resetAutoLift = () => {
    autoLiftRef.current = {
      candidate: null,
      candidateHits: 0,
      stableLabel: null,
      stableConfidence: 0,
      stableAt: 0,
    };
  };

  const normalizeLiftLabel = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === 'unknown') return null;
    return trimmed;
  };

  const handleAutoDetectedLift = (rawLabel, rawConfidence) => {
    if (manualLiftRef.current) return;

    const label = normalizeLiftLabel(rawLabel);
    const confidence = Number(rawConfidence) || 0;
    const now = Date.now();
    const tracker = autoLiftRef.current;
    const hasStrongSignal = label && confidence >= AUTO_LIFT_CONFIDENCE_MIN;

    if (hasStrongSignal) {
      if (tracker.candidate === label) {
        tracker.candidateHits += 1;
      } else {
        tracker.candidate = label;
        tracker.candidateHits = 1;
      }

      if (tracker.candidateHits >= AUTO_LIFT_STABLE_HITS) {
        tracker.stableLabel = label;
        tracker.stableConfidence = confidence;
        tracker.stableAt = now;
        setDetectedLift({
          label,
          confidence,
          isActive: true,
          isManual: false,
          status: 'stable',
        });
        return;
      }

      setDetectedLift((prev) => ({
        label: tracker.stableLabel || prev.label || label,
        confidence,
        isActive: Boolean(tracker.stableLabel),
        isManual: false,
        status: tracker.stableLabel ? 'stable' : 'detecting',
      }));
      return;
    }

    if (tracker.stableLabel && now - tracker.stableAt < AUTO_LIFT_HOLD_MS) {
      setDetectedLift({
        label: tracker.stableLabel,
        confidence: tracker.stableConfidence,
        isActive: true,
        isManual: false,
        status: 'stable',
      });
      return;
    }

    resetAutoLift();
    setDetectedLift(DEFAULT_DETECTED_LIFT);
  };

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      setLastMessage(data);

      if (data.type === 'session_summary') {
        setCurrentSessionSummary({
          reps: data.reps,
          tutSec: data.tut_sec,
          avgTempoSec: data.avg_tempo_sec,
          repBreakdown: data.rep_breakdown || [],
          avgVelocityMs: data.avg_velocity_ms,
          velocityLossPct: data.velocity_loss_pct,
          avgRomM: data.avg_rom_m,
          romLossPct: data.rom_loss_pct,
          detectedLift: data.detected_lift,
          liftConfidence: data.lift_confidence,
          sessionId: data.session_id || data.sid || null,
          repTimesSec: data.rep_times_sec || [],
          totalReps: data.reps,
          outputLossPct: data.output_loss_pct,
          avgPeakSpeedProxy: data.avg_peak_speed_proxy,
          speedLossPct: data.speed_loss_pct,
          receivedAt: Date.now(),
        });
        return;
      }

      if (data.type === 'sessions_list' || data.type === 'sessions') {
        setSessionsList(data);
        setSessionsLoading(false);
        return;
      }

      if (data.type === 'session_detail') {
        setSelectedSessionSummary(data);
        setSelectedSessionLoading(false);
        return;
      }

      if (data.type === 'session_raw') {
        setSelectedSessionRawPoints(data);
        setSelectedSessionRawLoading(false);
        return;
      }

      if (data.type === 'export_result' || data.type === 'export_session') {
        setExportResult(data);
        setExportLoading(false);
        return;
      }

      if (data.type === 'rep_event') {
        const normalized = {
          rep: data.rep,
          timestamp: data.t,
          repTime: data.rep_time,
          confidence: data.confidence,
          peakGyro: data.peak_gyro,
          peakVelocityMs: data.peak_velocity_ms,
          meanConcentricVelocityMs: data.mean_concentric_velocity_ms,
          romM: data.rom_m,
          romCm: data.rom_cm,
          receivedAt: Date.now(),
        };
        setRepEvents((prev) => [...prev, normalized]);
        setLastRepEvent({
          rep: data.rep,
          time: data.rep_time,
          confidence: data.confidence,
          peakGyro: data.peak_gyro,
          peakVelocityMs: data.peak_velocity_ms,
          romCm: data.rom_cm,
        });
        return;
      }

      if (data.reps !== undefined) setRepCount(data.reps);
      if (data.state !== undefined) setCurrentState(data.state);
      if (data.gyro_filt !== undefined) setGyroFilt(data.gyro_filt);
      if (data.detected_lift !== undefined) {
        handleAutoDetectedLift(data.detected_lift, data.lift_confidence);
      }

      if (data.type === 'ack') {
        if (data.action === 'start') {
          setRepCount(0);
          setIsRecording(true);
          setRepEvents([]);
          setCurrentSessionSummary(null);
          if (!manualLiftRef.current) {
            resetAutoLift();
            setDetectedLift(DEFAULT_DETECTED_LIFT);
          }
        } else if (data.action === 'stop') {
          setRepCount(data.reps !== undefined ? data.reps : repCount);
          setIsRecording(false);
        }
      }

      if (data.type === 'error') {
        if (data.action === 'sessions') setSessionsLoading(false);
        if (data.action === 'session_detail') setSelectedSessionLoading(false);
        if (data.action === 'session_raw') setSelectedSessionRawLoading(false);
        if (data.action === 'export_session') {
          setExportLoading(false);
          setExportResult({ ok: false, error: data.error || 'Export failed.' });
        }
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };

  const connect = (ws, ipAddress) => {
    if (wsRef.current) return;

    wsRef.current = ws;
    setWebsocket(ws);
    setConnectionStatus('connected');
    if (ipAddress) setPiIp(ipAddress);

    ws.onmessage = handleMessage;

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('error');
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      wsRef.current = null;
      setWebsocket(null);
    };
  };

  const disconnect = () => {
    if (!wsRef.current) return;
    wsRef.current.close();
    wsRef.current = null;
    setWebsocket(null);
    setConnectionStatus('disconnected');
    setRepCount(0);
    setCurrentState('WAITING');
    setIsRecording(false);
    setGyroFilt(0);
    manualLiftRef.current = null;
    resetAutoLift();
    setDetectedLift(DEFAULT_DETECTED_LIFT);
    setSessionsLoading(false);
    setSelectedSessionLoading(false);
    setSelectedSessionRawLoading(false);
    setExportLoading(false);
  };

  const sendMessage = (message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  };

  const startRecording = () => {
    const sent = sendMessage({ type: 'command', action: 'start' });
    if (!sent) return;
    setIsRecording(true);
    setRepCount(0);
    setRepEvents([]);
    setCurrentSessionSummary(null);
    setLastRepEvent(null);
    if (!manualLiftRef.current) {
      resetAutoLift();
      setDetectedLift(DEFAULT_DETECTED_LIFT);
    }
  };

  const stopRecording = () => {
    const sent = sendMessage({ type: 'command', action: 'stop' });
    if (sent) setIsRecording(false);
  };

  const setManualLift = (label) => {
    const normalizedLabel = normalizeLiftLabel(label);

    if (!normalizedLabel) {
      manualLiftRef.current = null;
      resetAutoLift();
      setDetectedLift(DEFAULT_DETECTED_LIFT);
      return;
    }

    manualLiftRef.current = normalizedLabel;
    setDetectedLift({
      label: normalizedLabel,
      confidence: 1,
      isActive: true,
      isManual: true,
      status: 'manual',
    });
  };

  const requestSessions = (limit = 30) => {
    setSessionsLoading(true);
    const sent = sendMessage({ type: 'command', action: 'sessions', limit });
    if (!sent) {
      setSessionsLoading(false);
      setSessionsList({ sessions: [], count: 0, error: 'Not connected.' });
    }
  };

  const requestSessionDetail = (sessionId) => {
    if (!sessionId) return;
    setSelectedSessionLoading(true);
    const sent = sendMessage({ type: 'command', action: 'session_detail', session_id: sessionId });
    if (!sent) {
      setSelectedSessionLoading(false);
      setSelectedSessionSummary({ error: 'Not connected.' });
    }
  };

  const requestSessionRaw = (sessionId, maxPoints = 2000, downsample = 5) => {
    if (!sessionId) return;
    setSelectedSessionRawLoading(true);
    const sent = sendMessage({
      type: 'command',
      action: 'session_raw',
      session_id: sessionId,
      max_points: maxPoints,
      downsample,
    });
    if (!sent) {
      setSelectedSessionRawLoading(false);
      setSelectedSessionRawPoints({ points: [] });
    }
  };

  const clearSelectedSession = () => {
    setSelectedSessionSummary(null);
    setSelectedSessionRawPoints(null);
    setSelectedSessionLoading(false);
    setSelectedSessionRawLoading(false);
  };

  const requestExportSession = (sessionId, timeoutMs = 8000) => {
    if (!sessionId) return;
    setExportLoading(true);
    setExportResult(null);
    const sent = sendMessage({
      type: 'command',
      action: 'export_session',
      session_id: sessionId,
      timeout_ms: timeoutMs,
    });
    if (!sent) {
      setExportLoading(false);
      setExportResult({ ok: false, error: 'Not connected.' });
    }
  };

  const clearExportResult = () => {
    setExportResult(null);
  };

  const buildExportUrl = (downloadUrlTemplate) => {
    if (!downloadUrlTemplate) return null;
    if (/^https?:\/\//i.test(downloadUrlTemplate)) return downloadUrlTemplate;
    if (!piIp) return null;

    const replaced = String(downloadUrlTemplate)
      .replace('{pi_ip}', piIp)
      .replace('{PI_IP}', piIp)
      .replace('{{PI_IP}}', piIp);

    if (/^https?:\/\//i.test(replaced)) return replaced;
    const normalizedPath = replaced.startsWith('/') ? replaced : `/${replaced}`;
    return `http://${piIp}:8766${normalizedPath}`;
  };

  const value = {
    websocket,
    connectionStatus,
    lastMessage,
    repCount,
    currentState,
    isRecording,
    gyroFilt,
    repEvents,
    lastRepEvent,
    currentSessionSummary,
    detectedLift,
    piIp,
    piIpAddress: piIp,
    sessionsList,
    sessionsLoading,
    selectedSessionSummary,
    selectedSessionLoading,
    selectedSessionRawPoints,
    selectedSessionRawLoading,
    exportResult,
    exportLoading,
    setPiIp,
    connect,
    disconnect,
    sendMessage,
    startRecording,
    stopRecording,
    setManualLift,
    requestSessions,
    requestSessionDetail,
    requestSessionRaw,
    clearSelectedSession,
    requestExportSession,
    clearExportResult,
    buildExportUrl,
  };

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }
  return context;
}

