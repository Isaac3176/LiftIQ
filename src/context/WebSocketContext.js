// src/context/WebSocketContext.js
import React, { createContext, useContext, useState, useRef, useCallback } from 'react';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const [websocket, setWebsocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastMessage, setLastMessage] = useState(null);
  
  // Live data from rep_update (authoritative from server)
  const [repCount, setRepCount] = useState(0);
  const [currentState, setCurrentState] = useState('WAITING');
  const [isRecording, setIsRecording] = useState(false);
  const [gyroFilt, setGyroFilt] = useState(0);
  // NEW: Live metrics from rep_update
  const [liveTutSec, setLiveTutSec] = useState(0);
  const [liveAvgTempoSec, setLiveAvgTempoSec] = useState(null);
  const [liveOutputLossPct, setLiveOutputLossPct] = useState(null);
  
  // Rep events (for animation and local breakdown)
  const [repEvents, setRepEvents] = useState([]);
  const [lastRepEvent, setLastRepEvent] = useState(null);
  
  // Session summary (source of truth after Stop)
  const [currentSessionSummary, setCurrentSessionSummary] = useState(null);
  
  // Sessions list from server (for History screen)
  const [sessionsList, setSessionsList] = useState(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  
  // Session detail from server
  const [sessionDetail, setSessionDetail] = useState(null);
  const [sessionDetailLoading, setSessionDetailLoading] = useState(false);
  
  const wsRef = useRef(null);

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      setLastMessage(data);

      // =============================================
      // 1️⃣ rep_update - Live stream (~10Hz)
      // =============================================
      if (data.type === 'rep_update') {
        // Authoritative values from server - do NOT compute locally
        if (data.reps !== undefined) setRepCount(data.reps);
        if (data.state !== undefined) setCurrentState(data.state);
        if (data.recording !== undefined) setIsRecording(data.recording);
        if (data.gyro_filt !== undefined) setGyroFilt(data.gyro_filt);
        
        // NEW: Live metrics
        if (data.tut_sec !== undefined) setLiveTutSec(data.tut_sec);
        if (data.avg_tempo_sec !== undefined) setLiveAvgTempoSec(data.avg_tempo_sec);
        if (data.output_loss_pct !== undefined) setLiveOutputLossPct(data.output_loss_pct);
        
        return;
      }

      // =============================================
      // 2️⃣ rep_event - Once per detected rep
      // =============================================
      if (data.type === 'rep_event') {
        console.log('🎯 Rep Event:', {
          rep: data.rep,
          t: data.t,
          confidence: data.confidence,
          peakGyro: data.peak_gyro
        });
        
        // Store for breakdown views
        setRepEvents(prev => [...prev, {
          rep: data.rep,
          t: data.t,
          confidence: data.confidence,
          peakGyro: data.peak_gyro,
          receivedAt: Date.now()
        }]);
        
        // Trigger animation
        setLastRepEvent({
          rep: data.rep,
          t: data.t,
          confidence: data.confidence,
          peakGyro: data.peak_gyro
        });
        
        return;
      }

      // =============================================
      // 3️⃣ session_summary - After Stop Workout
      // =============================================
      if (data.type === 'session_summary') {
        console.log('📊 Session Summary received:', {
          sessionId: data.session_id,
          totalReps: data.total_reps,
          tutSec: data.tut_sec,
          avgTempoSec: data.avg_tempo_sec,
          repBreakdown: data.rep_breakdown?.length || 0,
          outputLossPct: data.output_loss_pct
        });
        
        // Source of truth for Session Summary screen
        setCurrentSessionSummary({
          sessionId: data.session_id,
          totalReps: data.total_reps,
          tutSec: data.tut_sec,
          avgTempoSec: data.avg_tempo_sec,
          repTimesSec: data.rep_times_sec || [],
          repBreakdown: data.rep_breakdown || [],
          outputLossPct: data.output_loss_pct ?? null,
          peakGyroPerRep: data.peak_gyro_per_rep || [],
          receivedAt: Date.now()
        });
        
        return;
      }

      // =============================================
      // sessions_list - Response to list_sessions
      // =============================================
      if (data.type === 'sessions_list') {
        console.log('📋 Sessions List received:', {
          count: data.count,
          sessions: data.sessions?.length || 0
        });
        
        setSessionsList({
          count: data.count || 0,
          sessions: data.sessions || [],
          receivedAt: Date.now()
        });
        setSessionsLoading(false);
        
        return;
      }

      // =============================================
      // session_detail - Response to get_session
      // =============================================
      if (data.type === 'session_detail') {
        console.log('📄 Session Detail received:', {
          sessionId: data.summary?.session_id
        });
        
        setSessionDetail({
          summary: data.summary || {},
          receivedAt: Date.now()
        });
        setSessionDetailLoading(false);
        
        return;
      }

      // =============================================
      // ACK messages (Start/Stop confirmation)
      // =============================================
      if (data.type === 'ack') {
        console.log('✅ ACK received:', data.action);
        if (data.action === 'start') {
          // Clear for new session
          setRepEvents([]);
          setCurrentSessionSummary(null);
          setLastRepEvent(null);
          setLiveTutSec(0);
          setLiveAvgTempoSec(null);
          setLiveOutputLossPct(null);
        }
        // Note: recording state comes from rep_update, not ACK
      }

      console.log('📨 Received:', data.type || 'unknown');
      
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };

  const connect = (ws) => {
    if (wsRef.current) {
      console.log('WebSocket already exists, reusing connection');
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
      // Reset live data
      setRepCount(0);
      setCurrentState('WAITING');
      setIsRecording(false);
      setGyroFilt(0);
      setLiveTutSec(0);
      setLiveAvgTempoSec(null);
      setLiveOutputLossPct(null);
    }
  };

  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } else {
      console.warn('WebSocket not connected, cannot send:', message);
      return false;
    }
  }, []);

  // Send Start command
  const startRecording = useCallback(() => {
    // Clear local state for new session
    setRepEvents([]);
    setCurrentSessionSummary(null);
    setLastRepEvent(null);
    setLiveTutSec(0);
    setLiveAvgTempoSec(null);
    setLiveOutputLossPct(null);
    
    const sent = sendMessage({ type: 'command', action: 'start' });
    if (sent) {
      console.log('📤 Sent START command');
    }
    return sent;
  }, [sendMessage]);

  // Send Stop command
  const stopRecording = useCallback(() => {
    const sent = sendMessage({ type: 'command', action: 'stop' });
    if (sent) {
      console.log('📤 Sent STOP command');
    }
    return sent;
  }, [sendMessage]);

  // Request sessions list
  const requestSessions = useCallback((limit = 20) => {
    setSessionsLoading(true);
    const sent = sendMessage({ 
      type: 'cmd', 
      action: 'list_sessions', 
      limit 
    });
    if (!sent) setSessionsLoading(false);
    return sent;
  }, [sendMessage]);

  // Request session detail
  const requestSessionDetail = useCallback((sessionId) => {
    setSessionDetailLoading(true);
    setSessionDetail(null);
    const sent = sendMessage({ 
      type: 'cmd', 
      action: 'get_session', 
      session_id: sessionId 
    });
    if (!sent) setSessionDetailLoading(false);
    return sent;
  }, [sendMessage]);

  // Clear session detail
  const clearSessionDetail = useCallback(() => {
    setSessionDetail(null);
    setSessionDetailLoading(false);
  }, []);

  const value = {
    // Connection
    websocket,
    connectionStatus,
    lastMessage,
    
    // Live data (authoritative from server)
    repCount,
    currentState,
    isRecording,
    gyroFilt,
    liveTutSec,
    liveAvgTempoSec,
    liveOutputLossPct,
    
    // Rep events (for animation)
    repEvents,
    lastRepEvent,
    
    // Session summary (source of truth)
    currentSessionSummary,
    
    // Sessions list
    sessionsList,
    sessionsLoading,
    
    // Session detail
    sessionDetail,
    sessionDetailLoading,
    
    // Methods
    connect,
    disconnect,
    sendMessage,
    startRecording,
    stopRecording,
    requestSessions,
    requestSessionDetail,
    clearSessionDetail,
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