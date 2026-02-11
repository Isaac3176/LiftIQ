// src/context/WebSocketContext.js
import React, { createContext, useContext, useState, useRef } from 'react';

const WebSocketContext = createContext(null);

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
  const [detectedLift, setDetectedLift] = useState({
    label: null,
    confidence: 0,
    isActive: false,
  });
  
  const wsRef = useRef(null);

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
        setDetectedLift({
          label: data.detected_lift,
          confidence: data.lift_confidence || 0,
          isActive: data.detected_lift !== null && data.detected_lift !== 'unknown',
        });
      }

      // Handle ACK messages
      if (data.type === 'ack') {
        if (data.action === 'start') {
          setRepCount(0);
          setIsRecording(true);
          setRepEvents([]);
          setCurrentSessionSummary(null);
          setDetectedLift({ label: null, confidence: 0, isActive: false });
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
      setDetectedLift({ label: null, confidence: 0, isActive: false });
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
      setDetectedLift({ label: null, confidence: 0, isActive: false });
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
    setDetectedLift({
      label: label,
      confidence: 1.0,
      isActive: true,
      isManual: true,
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