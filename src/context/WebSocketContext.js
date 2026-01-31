// src/context/WebSocketContext.js
import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const [websocket, setWebsocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastMessage, setLastMessage] = useState(null);
  
  const [piIpAddress, setPiIpAddress] = useState(null);
  
  // =============================================
  // Live workout data (from rep_update)
  // =============================================
  const [repCount, setRepCount] = useState(0);
  const [currentState, setCurrentState] = useState('WAITING');
  const [isRecording, setIsRecording] = useState(false);
  const [gyroFilt, setGyroFilt] = useState(0);
  const [liveTutSec, setLiveTutSec] = useState(0);
  const [liveAvgTempoSec, setLiveAvgTempoSec] = useState(null);
  const [liveOutputLossPct, setLiveOutputLossPct] = useState(null);
  
  // Velocity proxy fields (gyro-based)
  const [liveAvgPeakSpeedProxy, setLiveAvgPeakSpeedProxy] = useState(null);
  const [liveSpeedLossPct, setLiveSpeedLossPct] = useState(null);
  
  // NEW: ML Pipeline fields (physics-based)
  const [liveVelocity, setLiveVelocity] = useState(0);
  const [liveDisplacement, setLiveDisplacement] = useState(0);
  const [liveRoll, setLiveRoll] = useState(0);
  const [livePitch, setLivePitch] = useState(0);
  const [liveYaw, setLiveYaw] = useState(0);
  const [liveAvgVelocityMs, setLiveAvgVelocityMs] = useState(null);
  const [liveVelocityLossPct, setLiveVelocityLossPct] = useState(null);
  const [liveAvgRomM, setLiveAvgRomM] = useState(null);
  const [liveRomLossPct, setLiveRomLossPct] = useState(null);
  
  // Rep events
  const [repEvents, setRepEvents] = useState([]);
  const [lastRepEvent, setLastRepEvent] = useState(null);
  
  // Current session summary
  const [currentSessionSummary, setCurrentSessionSummary] = useState(null);
  
  // =============================================
  // History & Session Management
  // =============================================
  const [sessionsList, setSessionsList] = useState(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  
  const [selectedSessionSummary, setSelectedSessionSummary] = useState(null);
  const [selectedSessionLoading, setSelectedSessionLoading] = useState(false);
  
  const [selectedSessionRawPoints, setSelectedSessionRawPoints] = useState(null);
  const [selectedSessionRawLoading, setSelectedSessionRawLoading] = useState(false);
  
  // Export state
  const [exportResult, setExportResult] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);
  
  const lastRequestedSessionId = useRef(null);
  const wsRef = useRef(null);

  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.data);
      setLastMessage(data);

      // =============================================
      // rep_update - Live stream (~10Hz)
      // =============================================
      if (data.type === 'rep_update') {
        // Core fields
        if (data.reps !== undefined) setRepCount(data.reps);
        if (data.state !== undefined) setCurrentState(data.state);
        if (data.recording !== undefined) setIsRecording(data.recording);
        if (data.gyro_filt !== undefined) setGyroFilt(data.gyro_filt);
        if (data.tut_sec !== undefined) setLiveTutSec(data.tut_sec);
        if (data.avg_tempo_sec !== undefined) setLiveAvgTempoSec(data.avg_tempo_sec);
        if (data.output_loss_pct !== undefined) setLiveOutputLossPct(data.output_loss_pct);
        
        // Velocity proxy (gyro-based)
        if (data.avg_peak_speed_proxy !== undefined) setLiveAvgPeakSpeedProxy(data.avg_peak_speed_proxy);
        if (data.speed_loss_pct !== undefined) setLiveSpeedLossPct(data.speed_loss_pct);
        
        // NEW: ML Pipeline fields (physics-based)
        if (data.velocity !== undefined) setLiveVelocity(data.velocity);
        if (data.displacement !== undefined) setLiveDisplacement(data.displacement);
        if (data.roll !== undefined) setLiveRoll(data.roll);
        if (data.pitch !== undefined) setLivePitch(data.pitch);
        if (data.yaw !== undefined) setLiveYaw(data.yaw);
        if (data.avg_velocity_ms !== undefined) setLiveAvgVelocityMs(data.avg_velocity_ms);
        if (data.velocity_loss_pct !== undefined) setLiveVelocityLossPct(data.velocity_loss_pct);
        if (data.avg_rom_m !== undefined) setLiveAvgRomM(data.avg_rom_m);
        if (data.rom_loss_pct !== undefined) setLiveRomLossPct(data.rom_loss_pct);
        return;
      }

      // =============================================
      // rep_event - Once per detected rep
      // =============================================
      if (data.type === 'rep_event') {
        setRepEvents(prev => [...prev, {
          rep: data.rep,
          t: data.t,
          confidence: data.confidence,
          tempoSec: data.tempo_sec,
          // Gyro-based proxy
          peakSpeedProxy: data.peak_speed_proxy,
          avgSpeedProxy: data.avg_speed_proxy,
          peakGyro: data.peak_gyro || data.peak_speed_proxy,
          // NEW: Physics-based velocity/ROM
          peakVelocityMs: data.peak_velocity_ms,
          meanConcentricVelocityMs: data.mean_concentric_velocity_ms,
          romM: data.rom_m,
          romCm: data.rom_cm,
          receivedAt: Date.now()
        }]);
        setLastRepEvent({
          rep: data.rep,
          t: data.t,
          confidence: data.confidence,
          tempoSec: data.tempo_sec,
          peakSpeedProxy: data.peak_speed_proxy,
          avgSpeedProxy: data.avg_speed_proxy,
          peakGyro: data.peak_gyro || data.peak_speed_proxy,
          peakVelocityMs: data.peak_velocity_ms,
          meanConcentricVelocityMs: data.mean_concentric_velocity_ms,
          romM: data.rom_m,
          romCm: data.rom_cm
        });
        return;
      }

      // =============================================
      // session_summary - After Stop Workout
      // =============================================
      if (data.type === 'session_summary') {
        setCurrentSessionSummary({
          sessionId: data.session_id,
          totalReps: data.total_reps,
          tutSec: data.tut_sec,
          avgTempoSec: data.avg_tempo_sec,
          repTimesSec: data.rep_times_sec || [],
          repBreakdown: data.rep_breakdown || [],
          outputLossPct: data.output_loss_pct ?? null,
          peakGyroPerRep: data.peak_gyro_per_rep || [],
          // Gyro-based proxy
          avgPeakSpeedProxy: data.avg_peak_speed_proxy ?? null,
          speedLossPct: data.speed_loss_pct ?? null,
          // NEW: Physics-based velocity/ROM
          avgVelocityMs: data.avg_velocity_ms ?? null,
          velocityLossPct: data.velocity_loss_pct ?? null,
          avgRomM: data.avg_rom_m ?? null,
          romLossPct: data.rom_loss_pct ?? null,
          receivedAt: Date.now()
        });
        return;
      }

      // =============================================
      // sessions_list
      // =============================================
      if (data.type === 'sessions_list') {
        setSessionsList({
          count: data.count || 0,
          sessions: data.sessions || [],
          receivedAt: Date.now()
        });
        setSessionsLoading(false);
        return;
      }

      // =============================================
      // session_detail
      // =============================================
      if (data.type === 'session_detail') {
        if (data.ok) {
          setSelectedSessionSummary({
            sessionId: data.session_id,
            summary: data.summary || {},
            receivedAt: Date.now()
          });
        } else {
          setSelectedSessionSummary({ error: true, sessionId: data.session_id });
        }
        setSelectedSessionLoading(false);
        return;
      }

      // =============================================
      // session_raw
      // =============================================
      if (data.type === 'session_raw') {
        if (data.ok) {
          setSelectedSessionRawPoints({
            sessionId: data.session_id,
            count: data.count || 0,
            points: data.points || [],
            receivedAt: Date.now()
          });
        } else {
          setSelectedSessionRawPoints({ error: true, sessionId: data.session_id });
        }
        setSelectedSessionRawLoading(false);
        return;
      }

      // =============================================
      // export_result
      // =============================================
      if (data.type === 'export_result') {
        setExportResult({
          ok: data.ok,
          filename: data.filename,
          zipPath: data.zip_path,
          downloadUrlTemplate: data.download_url_template,
          error: data.error,
          receivedAt: Date.now()
        });
        setExportLoading(false);
        return;
      }

      // =============================================
      // ACK messages
      // =============================================
      if (data.type === 'ack') {
        if (data.action === 'start') {
          setIsRecording(true);
          setRepCount(0);
          setRepEvents([]);
          setCurrentSessionSummary(null);
          setLastRepEvent(null);
          setLiveTutSec(0);
          setLiveAvgTempoSec(null);
          setLiveOutputLossPct(null);
          setLiveAvgPeakSpeedProxy(null);
          setLiveSpeedLossPct(null);
          // Reset ML fields
          setLiveVelocity(0);
          setLiveDisplacement(0);
          setLiveAvgVelocityMs(null);
          setLiveVelocityLossPct(null);
          setLiveAvgRomM(null);
          setLiveRomLossPct(null);
        }
        if (data.action === 'stop') {
          setIsRecording(false);
        }
      }

    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }, []);

  // =============================================
  // Connection Management
  // =============================================
  const connect = useCallback((ws, ipAddress) => {
    if (wsRef.current) return;

    if (ipAddress) setPiIpAddress(ipAddress);

    wsRef.current = ws;
    setWebsocket(ws);
    setConnectionStatus('connected');

    ws.onmessage = handleMessage;
    ws.onerror = () => setConnectionStatus('error');
    ws.onclose = () => {
      setConnectionStatus('disconnected');
      wsRef.current = null;
      setWebsocket(null);
    };
  }, [handleMessage]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setWebsocket(null);
      setConnectionStatus('disconnected');
      setRepCount(0);
      setCurrentState('WAITING');
      setIsRecording(false);
      setGyroFilt(0);
      setLiveTutSec(0);
      setLiveAvgTempoSec(null);
      setLiveOutputLossPct(null);
      setLiveAvgPeakSpeedProxy(null);
      setLiveSpeedLossPct(null);
      setLiveVelocity(0);
      setLiveDisplacement(0);
      setLiveAvgVelocityMs(null);
      setLiveVelocityLossPct(null);
      setLiveAvgRomM(null);
      setLiveRomLossPct(null);
    }
  }, []);

  const setPiIp = useCallback((ip) => setPiIpAddress(ip), []);

  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  // =============================================
  // Workout Commands
  // =============================================
  const startRecording = useCallback(() => {
    setRepEvents([]);
    setCurrentSessionSummary(null);
    setLastRepEvent(null);
    setLiveTutSec(0);
    setLiveAvgTempoSec(null);
    setLiveOutputLossPct(null);
    setLiveAvgPeakSpeedProxy(null);
    setLiveSpeedLossPct(null);
    setLiveVelocity(0);
    setLiveDisplacement(0);
    setLiveAvgVelocityMs(null);
    setLiveVelocityLossPct(null);
    setLiveAvgRomM(null);
    setLiveRomLossPct(null);
    return sendMessage({ type: 'cmd', action: 'start' });
  }, [sendMessage]);

  const stopRecording = useCallback(() => {
    return sendMessage({ type: 'cmd', action: 'stop' });
  }, [sendMessage]);

  // =============================================
  // History Commands
  // =============================================
  const requestSessions = useCallback((limit = 30) => {
    setSessionsLoading(true);
    const sent = sendMessage({ type: 'cmd', action: 'list_sessions', limit });
    if (!sent) setSessionsLoading(false);
    return sent;
  }, [sendMessage]);

  const requestSessionDetail = useCallback((sessionId) => {
    lastRequestedSessionId.current = sessionId;
    setSelectedSessionLoading(true);
    setSelectedSessionSummary(null);
    const sent = sendMessage({ type: 'cmd', action: 'get_session', session_id: sessionId });
    if (!sent) setSelectedSessionLoading(false);
    return sent;
  }, [sendMessage]);

  const requestSessionRaw = useCallback((sessionId, limit = 2000, stride = 5) => {
    setSelectedSessionRawLoading(true);
    setSelectedSessionRawPoints(null);
    const sent = sendMessage({ type: 'cmd', action: 'get_session_raw', session_id: sessionId, limit, stride });
    if (!sent) setSelectedSessionRawLoading(false);
    return sent;
  }, [sendMessage]);

  const clearSelectedSession = useCallback(() => {
    lastRequestedSessionId.current = null;
    setSelectedSessionSummary(null);
    setSelectedSessionRawPoints(null);
    setSelectedSessionLoading(false);
    setSelectedSessionRawLoading(false);
  }, []);

  // =============================================
  // Export Command
  // =============================================
  const requestExportSession = useCallback((sessionId, httpPort = 8000) => {
    setExportLoading(true);
    setExportResult(null);
    const sent = sendMessage({ type: 'cmd', action: 'export_session', session_id: sessionId, start_http: true, http_port: httpPort });
    if (!sent) {
      setExportLoading(false);
      setExportResult({ ok: false, error: 'Not connected' });
    }
    return sent;
  }, [sendMessage]);

  const clearExportResult = useCallback(() => {
    setExportResult(null);
    setExportLoading(false);
  }, []);

  const buildExportUrl = useCallback((urlTemplate) => {
    if (!urlTemplate || !piIpAddress) return null;
    return urlTemplate.replace('<PI_IP>', piIpAddress);
  }, [piIpAddress]);

  // =============================================
  // Reconnect Handler
  // =============================================
  useEffect(() => {
    if (connectionStatus === 'connected' && lastRequestedSessionId.current) {
      requestSessionDetail(lastRequestedSessionId.current);
      requestSessionRaw(lastRequestedSessionId.current);
    }
  }, [connectionStatus, requestSessionDetail, requestSessionRaw]);

  const value = {
    // Connection
    websocket, connectionStatus, lastMessage, piIpAddress,
    
    // Live workout data
    repCount, currentState, isRecording, gyroFilt,
    liveTutSec, liveAvgTempoSec, liveOutputLossPct,
    
    // Velocity proxy (gyro-based)
    liveAvgPeakSpeedProxy, liveSpeedLossPct,
    
    // ML Pipeline (physics-based)
    liveVelocity, liveDisplacement,
    liveRoll, livePitch, liveYaw,
    liveAvgVelocityMs, liveVelocityLossPct,
    liveAvgRomM, liveRomLossPct,
    
    // Rep events
    repEvents, lastRepEvent,
    
    // Current session summary
    currentSessionSummary,
    
    // History & Sessions
    sessionsList, sessionsLoading,
    selectedSessionSummary, selectedSessionLoading,
    selectedSessionRawPoints, selectedSessionRawLoading,
    
    // Export
    exportResult, exportLoading,
    
    // Methods
    connect, disconnect, setPiIp, sendMessage,
    startRecording, stopRecording,
    requestSessions, requestSessionDetail, requestSessionRaw, clearSelectedSession,
    requestExportSession, clearExportResult, buildExportUrl,
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