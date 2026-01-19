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
  const [repEvents, setRepEvents] = useState([]); // Store rep_event history
  const [lastRepEvent, setLastRepEvent] = useState(null); // Latest rep for animation
  const [currentSessionSummary, setCurrentSessionSummary] = useState(null); // Post-workout summary
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
          // NEW: Store peak gyro per rep array and output loss percentage
          peakGyroPerRep: data.peak_gyro_per_rep || [],
          outputLossPct: data.output_loss_pct ?? null, // Use null if not provided
          receivedAt: Date.now()
        });
        
        return; // Don't process further
      }

      // Handle rep_event messages (triggers animation + stores per-rep data)
      if (data.type === 'rep_event') {
        console.log('🎯 Rep Event:', {
          rep: data.rep,
          time: data.t,
          confidence: data.confidence,
          peakGyro: data.peak_gyro
        });
        
        // Store in session history - NOW INCLUDING peak_gyro
        setRepEvents(prev => [...prev, {
          rep: data.rep,
          timestamp: data.t,
          repTime: data.rep_time || data.t, // fallback to t if rep_time not present
          confidence: data.confidence,
          peakGyro: data.peak_gyro, // NEW: Store peak gyro output for this rep
          receivedAt: Date.now()
        }]);
        
        // Set as latest event (for animation trigger)
        setLastRepEvent({
          rep: data.rep,
          time: data.t,
          confidence: data.confidence,
          peakGyro: data.peak_gyro // NEW: Include peak gyro in latest event
        });
        
        return; // Don't process further
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
          setRepEvents([]); // Clear rep events for new session
          setCurrentSessionSummary(null); // Clear previous summary
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
      // Don't reset state - preserve it for reconnect
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
      // Reset all state on intentional disconnect
      setRepCount(0);
      setCurrentState('WAITING');
      setIsRecording(false);
      setGyroFilt(0);
    }
  };

  const sendMessage = (message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } else {
      console.warn('WebSocket not connected, cannot send:', message);
      return false;
    }
  };

  // Send Start command to server
  const startRecording = () => {
    const sent = sendMessage({ type: 'command', action: 'start' });
    if (sent) {
      console.log('📤 Sent START command to server');
      console.log('⚠️ Server does not acknowledge START - using client-side recording state');
      // Set recording state immediately (server doesn't respond properly)
      setIsRecording(true);
      setRepCount(0);
      setRepEvents([]); // Clear rep events for new session
      setCurrentSessionSummary(null); // Clear previous summary
      setLastRepEvent(null);
    }
  };

  // Send Stop command to server
  const stopRecording = () => {
    const sent = sendMessage({ type: 'command', action: 'stop' });
    if (sent) {
      console.log('📤 Sent STOP command to server');
      console.log('⚠️ Server does not acknowledge STOP - using client-side recording state');
      // Set recording state immediately (server doesn't respond properly)
      setIsRecording(false);
    }
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
    connect,
    disconnect,
    sendMessage,
    startRecording,
    stopRecording,
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