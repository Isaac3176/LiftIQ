// src/context/WebSocketContext.js
import React, { createContext, useContext, useState, useRef } from 'react';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const [websocket, setWebsocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastMessage, setLastMessage] = useState(null);
  const [repCount, setRepCount] = useState(0);
  const [currentState, setCurrentState] = useState('WAITING');
  const wsRef = useRef(null);

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      setLastMessage(data);

      switch (data.type) {
        case 'rep_update':
          setRepCount(data.reps || 0);
          setCurrentState(data.state || 'WAITING');
          break;
        
        case 'imu_data':
          break;
        
        default:
          console.log('Unknown message type:', data.type);
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
      setRepCount(0);
      setCurrentState('WAITING');
    }
  };

  const sendMessage = (message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected');
    }
  };

  const resetReps = () => {
    setRepCount(0);
    setCurrentState('WAITING');
    sendMessage({ type: 'reset_reps' });
  };

  const value = {
    websocket,
    connectionStatus,
    lastMessage,
    repCount,
    currentState,
    connect,
    disconnect,
    sendMessage,
    resetReps,
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