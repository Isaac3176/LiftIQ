// src/utils/websocket.js
export function connectWebSocket(ipAddress, port, onSuccess, onError) {
  const url = `ws://${ipAddress}:${port}`;
  
  try {
    const ws = new WebSocket(url);
    
    let timeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        onError('Connection timeout. Check network and Pi server.');
      }
    }, 5000);
    
    ws.onopen = () => {
      clearTimeout(timeout);
      console.log('WebSocket connected to', url);
      onSuccess(ws);
    };
    
    ws.onerror = (error) => {
      clearTimeout(timeout);
      console.error('WebSocket error:', error);
      onError('Failed to connect. Check IP address and ensure Pi server is running.');
    };
    
    ws.onclose = () => {
      clearTimeout(timeout);
      console.log('WebSocket closed');
    };
    
  } catch (error) {
    console.error('Failed to create WebSocket:', error);
    onError('Invalid IP address or network error.');
  }
}