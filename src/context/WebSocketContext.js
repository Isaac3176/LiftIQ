// src/context/WebSocketContext.js
import React, { createContext, useContext, useState, useRef, useCallback } from 'react';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const [websocket, setWebsocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastMessage, setLastMessage] = useState(null);
  const [repCount, setRepCount] = useState(0);
  const [currentState, setCurrentState] = useState('WAITING');
  const [isRecording, setIsRecording] = useState(false);
  const [gyroFilt, setGyroFilt] = useState(0);
  const [repEvents, setRepEvents] = useState([]); // Store rep_event history
  const [lastRepEvent, setLastRepEvent] = useState(null); // Latest rep for animation
  const [currentSessionSummary, setCurrentSessionSummary] = useState(null); // Post-workout summary
  
  // NEW: Sessions list from server
  const [sessionsList, setSessionsList] = useState(null); // { count, sessions }
  const [sessionsLoading, setSessionsLoading] = useState(false);
  
  // NEW: Session detail from server
  const [sessionDetail, setSessionDetail] = useState(null);
  const [sessionDetailLoading, setSessionDetailLoading] = useState(false);
  
  const wsRef = useRef(null);

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      setLastMessage(data);

      // Handle session_summary messages (post-workout metrics from server)
      if (data.type === 'session_summary') {
        console.log('📊 Session Summary received:', {
          reps: data.reps,
          tut: data.tut_sec,
          avgTempo: data.avg_tempo_sec,
          repBreakdown: data.rep_breakdown?.length || 0,
          peakGyroPerRep: data.peak_gyro_per_rep?.length || 0,
          outputLossPct: data.output_loss_pct
        });
        
        setCurrentSessionSummary({
          reps: data.reps,
          tutSec: data.tut_sec,
          avgTempoSec: data.avg_tempo_sec,
          repBreakdown: data.rep_breakdown || [],
          peakGyroPerRep: data.peak_gyro_per_rep || [],
          outputLossPct: data.output_loss_pct ?? null,
          receivedAt: Date.now()
        });
        
        return;
      }

      // NEW: Handle sessions_list messages (response to list_sessions)
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

      // NEW: Handle session_detail messages (response to get_session)
      if (data.type === 'session_detail') {
        console.log('📄 Session Detail received:', {
          sessionId: data.summary?.session_id,
          reps: data.summary?.total_reps
        });
        
        setSessionDetail({
          summary: data.summary || {},
          receivedAt: Date.now()
        });
        setSessionDetailLoading(false);
        
        return;
      }

      // Handle rep_event messages (triggers animation + stores per-rep data)
      if (data.type === 'rep_event') {
        console.log('🎯 Rep Event:', {
          rep: data.rep,
          time: data.t,
          confidence: data.confidence,
          peakGyro: data.peak_gyro
        });
        
        setRepEvents(prev => [...prev, {
          rep: data.rep,
          timestamp: data.t,
          repTime: data.rep_time || data.t,
          confidence: data.confidence,
          peakGyro: data.peak_gyro,
          receivedAt: Date.now()
        }]);
        
        setLastRepEvent({
          rep: data.rep,
          time: data.t,
          confidence: data.confidence,
          peakGyro: data.peak_gyro
        });
        
        return;
      }

      console.log('📨 Received:', data.type || 'unknown', { 
        recording: data.recording, 
        reps: data.reps,
        state: data.state 
      });

      // Always update reps and gyro data from rep_update
      if (data.reps !== undefined) setRepCount(data.reps);
      if (data.state !== undefined) setCurrentState(data.state);
      if (data.gyro_filt !== undefined) setGyroFilt(data.gyro_filt);

      // Handle ACK messages (confirmation of Start/Stop)
      if (data.type === 'ack') {
        console.log('✅ ACK received:', data.action, data);
        if (data.action === 'start') {
          setRepCount(0);
          setIsRecording(true);
          setRepEvents([]);
          setCurrentSessionSummary(null);
          console.log('✅ Start ACK - Recording enabled, session data cleared');
        } else if (data.action === 'stop') {
          setRepCount(data.reps !== undefined ? data.reps : repCount);
          setIsRecording(false);
          console.log(`🛑 Stop ACK - Recording disabled`);
        }
      }
      
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
      console.log('WebSocket closed - will attempt reconnect');
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

  // Send Start command to server
  const startRecording = () => {
    const sent = sendMessage({ type: 'command', action: 'start' });
    if (sent) {
      console.log('📤 Sent START command to server');
      setIsRecording(true);
      setRepCount(0);
      setRepEvents([]);
      setCurrentSessionSummary(null);
      setLastRepEvent(null);
    }
  };

  // Send Stop command to server
  const stopRecording = () => {
    const sent = sendMessage({ type: 'command', action: 'stop' });
    if (sent) {
      console.log('📤 Sent STOP command to server');
      setIsRecording(false);
    }
  };

  // NEW: Request sessions list from server
  const requestSessions = useCallback((limit = 20) => {
    setSessionsLoading(true);
    const sent = sendMessage({ 
      type: 'cmd', 
      action: 'list_sessions', 
      limit: limit 
    });
    if (sent) {
      console.log('📤 Sent list_sessions request, limit:', limit);
    } else {
      setSessionsLoading(false);
    }
    return sent;
  }, [sendMessage]);

  // NEW: Request session detail from server
  const requestSessionDetail = useCallback((sessionId) => {
    setSessionDetailLoading(true);
    setSessionDetail(null); // Clear previous detail
    const sent = sendMessage({ 
      type: 'cmd', 
      action: 'get_session', 
      session_id: sessionId 
    });
    if (sent) {
      console.log('📤 Sent get_session request, id:', sessionId);
    } else {
      setSessionDetailLoading(false);
    }
    return sent;
  }, [sendMessage]);

  // NEW: Clear session detail (when navigating away)
  const clearSessionDetail = useCallback(() => {
    setSessionDetail(null);
    setSessionDetailLoading(false);
  }, []);

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
    // NEW: Sessions list
    sessionsList,
    sessionsLoading,
    // NEW: Session detail
    sessionDetail,
    sessionDetailLoading,
    // Methods
    connect,
    disconnect,
    sendMessage,
    startRecording,
    stopRecording,
    // NEW: Session methods
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