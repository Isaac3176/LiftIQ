// src/context/WebSocketContext.js
import React, { createContext, useContext, useState, useRef } from 'react';

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
  
  // Detected lift classification (Model 3)
  const [detectedLift, setDetectedLift] = useState(DEFAULT_DETECTED_LIFT);
  
  // Pi IP address (for exports, etc)
  const [piIp, setPiIp] = useState(null);
  
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
    if (manualLiftRef.current) {
      return;
    }

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

      // Handle session_summary messages
      if (data.type === 'session_summary') {
        setCurrentSessionSummary({
          reps: data.reps,
          tutSec: data.tut_sec,
          avgTempoSec: data.avg_tempo_sec,
          repBreakdown: data.rep_breakdown || [],
          // ML pipeline fields
          avgVelocityMs: data.avg_velocity_ms,
          velocityLossPct: data.velocity_loss_pct,
          avgRomM: data.avg_rom_m,
          romLossPct: data.rom_loss_pct,
          detectedLift: data.detected_lift,
          liftConfidence: data.lift_confidence,
          receivedAt: Date.now()
        });
        return;
      }

      // Handle rep_event messages
      if (data.type === 'rep_event') {
        setRepEvents(prev => [...prev, {
          rep: data.rep,
          timestamp: data.t,
          repTime: data.rep_time,
          confidence: data.confidence,
          peakGyro: data.peak_gyro,
          // ML pipeline fields
          peakVelocityMs: data.peak_velocity_ms,
          meanConcentricVelocityMs: data.mean_concentric_velocity_ms,
          romM: data.rom_m,
          romCm: data.rom_cm,
          receivedAt: Date.now()
        }]);
        
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

      // Update core state from rep_update
      if (data.reps !== undefined) setRepCount(data.reps);
      if (data.state !== undefined) setCurrentState(data.state);
      if (data.gyro_filt !== undefined) setGyroFilt(data.gyro_filt);

      // Handle detected lift classification (from server-side inference)
      if (data.detected_lift !== undefined) {
        handleAutoDetectedLift(data.detected_lift, data.lift_confidence);
      }

      // Handle ACK messages
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
      
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };

  const connect = (ws) => {
    if (wsRef.current) {
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
      setConnectionStatus('disconnected');
      wsRef.current = null;
      setWebsocket(null);
    };
  };

  const disconnect = () => {
    if (wsRef.current) {
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
    }
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
    if (sent) {
      setIsRecording(true);
      setRepCount(0);
      setRepEvents([]);
      setCurrentSessionSummary(null);
      setLastRepEvent(null);
      if (!manualLiftRef.current) {
        resetAutoLift();
        setDetectedLift(DEFAULT_DETECTED_LIFT);
      }
    }
  };

  const stopRecording = () => {
    const sent = sendMessage({ type: 'command', action: 'stop' });
    if (sent) {
      setIsRecording(false);
    }
  };

  // Manual lift selection (override ML detection)
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
    setPiIp,
    connect,
    disconnect,
    sendMessage,
    startRecording,
    stopRecording,
    setManualLift,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }
  return context;
}
