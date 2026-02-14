"""
LiftIQ PC Inference Server

Connects to Pi's WebSocket, runs lift classification, broadcasts to app.

Architecture:
  [IMU] → [Pi:8765] → [This PC:8766] → [React Native App]
                         ↓
                    TFLite Model

Usage:
  python inference_server.py --pi-ip 192.168.1.100

Requirements:
  pip install websockets numpy tensorflow
"""

import asyncio
import json
import argparse
import time
from collections import deque
from pathlib import Path

import numpy as np
import websockets

# =============================================================================
# Configuration
# =============================================================================

PI_PORT = 8765
LOCAL_PORT = 8766  # App connects here

MODEL_PATH = "ml/models/lift_classifier.tflite"
METADATA_PATH = "ml/models/lift_classifier_metadata.json"

WINDOW_SAMPLES = 250  # 2.5s at 100Hz
INFERENCE_INTERVAL = 0.5  # Run inference every 0.5s
CONFIDENCE_THRESHOLD = 0.6

# =============================================================================
# Lift Classifier
# =============================================================================

class LiftClassifier:
    """TFLite-based exercise classification."""
    
    def __init__(self, model_path, metadata_path):
        self.model_path = model_path
        self.metadata_path = metadata_path
        self.interpreter = None
        self.input_details = None
        self.output_details = None
        self.labels = []
        self.label_names = {}
        self.norm_mean = np.zeros(6, dtype=np.float32)
        self.norm_std = np.ones(6, dtype=np.float32)
        self.buffer = deque(maxlen=WINDOW_SAMPLES)
        self.enabled = False
        
    def load(self):
        """Load model and metadata."""
        if not Path(self.model_path).exists():
            print(f"[Classifier] Model not found: {self.model_path}")
            print(f"[Classifier] Run training first: python ml/scripts/train_classifier.py")
            return False
            
        try:
            import tensorflow as tf
            self.interpreter = tf.lite.Interpreter(model_path=self.model_path)
            self.interpreter.allocate_tensors()
            self.input_details = self.interpreter.get_input_details()
            self.output_details = self.interpreter.get_output_details()
            
            print(f"[Classifier] Loaded: {self.model_path}")
            print(f"[Classifier] Input: {self.input_details[0]['shape']}")
            
        except Exception as e:
            print(f"[Classifier] Failed to load model: {e}")
            return False
        
        # Load metadata
        if Path(self.metadata_path).exists():
            try:
                with open(self.metadata_path) as f:
                    meta = json.load(f)
                self.labels = meta.get('labels', [])
                self.label_names = meta.get('label_names', {})
                self.norm_mean = np.array(meta.get('norm_mean', [0]*6), dtype=np.float32)
                self.norm_std = np.array(meta.get('norm_std', [1]*6), dtype=np.float32)
                print(f"[Classifier] Classes: {len(self.labels)}")
            except Exception as e:
                print(f"[Classifier] Failed to load metadata: {e}")
        
        self.enabled = True
        return True
    
    def add_sample(self, ax, ay, az, gx, gy, gz):
        """Add a sensor sample to the buffer."""
        self.buffer.append([ax, ay, az, gx, gy, gz])
    
    def clear_buffer(self):
        """Clear the sensor buffer."""
        self.buffer.clear()
    
    def predict(self):
        """Run inference on current buffer."""
        if not self.enabled or len(self.buffer) < WINDOW_SAMPLES:
            return None, 0.0, {}
        
        try:
            window = np.array(list(self.buffer), dtype=np.float32)
            window = (window - self.norm_mean) / self.norm_std
            window = window.reshape(1, WINDOW_SAMPLES, 6)
            
            self.interpreter.set_tensor(self.input_details[0]['index'], window)
            self.interpreter.invoke()
            output = self.interpreter.get_tensor(self.output_details[0]['index'])[0]
            
            pred_idx = int(np.argmax(output))
            confidence = float(output[pred_idx])
            
            # Get top 3 predictions
            top_indices = np.argsort(output)[-3:][::-1]
            all_probs = {self.labels[i]: round(float(output[i]), 3) for i in top_indices}
            
            if confidence >= CONFIDENCE_THRESHOLD and pred_idx < len(self.labels):
                label = self.labels[pred_idx]
            else:
                label = None
            
            return label, confidence, all_probs
            
        except Exception as e:
            print(f"[Classifier] Error: {e}")
            return None, 0.0, {}


# =============================================================================
# Global State
# =============================================================================

classifier = LiftClassifier(MODEL_PATH, METADATA_PATH)
app_clients = set()

# Current state (relayed from Pi + our inference)
current_state = {
    "type": "rep_update",
    "t": 0.0,
    "reps": 0,
    "state": "WAITING",
    "recording": False,
    "gyro_filt": 0.0,
    "tut_sec": 0.0,
    "avg_tempo_sec": None,
    "output_loss_pct": None,
    "avg_peak_speed_proxy": None,
    "speed_loss_pct": None,
    "detected_lift": None,
    "lift_confidence": 0.0,
    "lift_probs": {},
}

# Session tracking for majority voting
session_votes = {}
session_active = False


# =============================================================================
# Broadcast to App Clients
# =============================================================================

async def broadcast_to_apps(msg: dict):
    """Send message to all connected app clients."""
    if not app_clients:
        return
    data = json.dumps(msg)
    dead = []
    for ws in list(app_clients):
        try:
            await ws.send(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        app_clients.discard(ws)


# =============================================================================
# Pi WebSocket Client
# =============================================================================

async def connect_to_pi(pi_ip: str):
    """Connect to Pi and process IMU data."""
    global current_state, session_votes, session_active
    
    pi_uri = f"ws://{pi_ip}:{PI_PORT}"
    print(f"[Pi] Connecting to {pi_uri}...")
    
    last_inference = 0.0
    reconnect_delay = 1.0
    
    while True:
        try:
            async with websockets.connect(pi_uri, ping_interval=20, ping_timeout=20) as ws:
                print(f"[Pi] Connected!")
                reconnect_delay = 1.0
                
                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                    except:
                        continue
                    
                    msg_type = msg.get("type")
                    
                    # Handle rep_update - main data stream
                    if msg_type == "rep_update":
                        # Extract IMU data if present (we need raw ax,ay,az,gx,gy,gz)
                        # Pi might send these in the message
                        ax = msg.get("ax", 0)
                        ay = msg.get("ay", 0)
                        az = msg.get("az", 0)
                        gx = msg.get("gx", 0)
                        gy = msg.get("gy", 0)
                        gz = msg.get("gz", 0)
                        
                        # Add to classifier buffer
                        classifier.add_sample(ax, ay, az, gx, gy, gz)
                        
                        # Track session state
                        was_active = session_active
                        session_active = msg.get("recording", False)
                        
                        if session_active and not was_active:
                            # Session started
                            session_votes = {}
                            classifier.clear_buffer()
                            print("[Session] Started - cleared classifier buffer")
                        
                        if not session_active and was_active:
                            # Session ended - compute final vote
                            if session_votes:
                                best = max(session_votes, key=session_votes.get)
                                total = sum(session_votes.values())
                                print(f"[Session] Ended - Final: {best} ({session_votes[best]}/{total} votes)")
                        
                        # Run inference periodically
                        now = time.time()
                        if now - last_inference >= INFERENCE_INTERVAL:
                            label, conf, probs = classifier.predict()
                            
                            if label:
                                current_state["detected_lift"] = label
                                current_state["lift_confidence"] = round(conf, 2)
                                current_state["lift_probs"] = probs
                                
                                # Vote during active session
                                if session_active:
                                    session_votes[label] = session_votes.get(label, 0) + 1
                            
                            last_inference = now
                        
                        # Update current state from Pi
                        current_state.update({
                            "type": "rep_update",
                            "t": msg.get("t", 0),
                            "reps": msg.get("reps", 0),
                            "state": msg.get("state", "WAITING"),
                            "recording": msg.get("recording", False),
                            "gyro_filt": msg.get("gyro_filt", 0),
                            "tut_sec": msg.get("tut_sec", 0),
                            "avg_tempo_sec": msg.get("avg_tempo_sec"),
                            "output_loss_pct": msg.get("output_loss_pct"),
                            "avg_peak_speed_proxy": msg.get("avg_peak_speed_proxy"),
                            "speed_loss_pct": msg.get("speed_loss_pct"),
                        })
                        
                        # Broadcast to apps with our inference added
                        await broadcast_to_apps(current_state)
                    
                    # Forward other messages directly (rep_event, session_summary, etc.)
                    elif msg_type in ("rep_event", "session_summary", "ack", "error", "status"):
                        # Add our lift detection to these too
                        msg["detected_lift"] = current_state.get("detected_lift")
                        msg["lift_confidence"] = current_state.get("lift_confidence")
                        await broadcast_to_apps(msg)
                    
                    else:
                        # Forward unknown messages
                        await broadcast_to_apps(msg)
        
        except websockets.exceptions.ConnectionClosed:
            print(f"[Pi] Connection closed")
        except ConnectionRefusedError:
            print(f"[Pi] Connection refused - is the Pi server running?")
        except Exception as e:
            print(f"[Pi] Error: {e}")
        
        print(f"[Pi] Reconnecting in {reconnect_delay}s...")
        await asyncio.sleep(reconnect_delay)
        reconnect_delay = min(reconnect_delay * 2, 30)


# =============================================================================
# App WebSocket Server
# =============================================================================

async def handle_app_client(ws):
    """Handle connections from React Native app."""
    app_clients.add(ws)
    remote = ws.remote_address
    print(f"[App] Client connected: {remote}")
    
    try:
        # Send current state
        await ws.send(json.dumps(current_state))
        
        # Forward commands to Pi (if needed in future)
        async for raw in ws:
            try:
                msg = json.loads(raw)
                print(f"[App] Received: {msg.get('type', 'unknown')}")
                # Commands would be forwarded to Pi here
            except:
                continue
    
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        app_clients.discard(ws)
        print(f"[App] Client disconnected: {remote}")


async def start_app_server():
    """Start WebSocket server for app connections."""
    print(f"[App] Server listening on ws://0.0.0.0:{LOCAL_PORT}")
    server = await websockets.serve(
        handle_app_client,
        "0.0.0.0",
        LOCAL_PORT,
        ping_interval=20,
        ping_timeout=20
    )
    await server.wait_closed()


# =============================================================================
# Main
# =============================================================================

async def main(pi_ip: str):
    print("=" * 50)
    print("LiftIQ PC Inference Server")
    print("=" * 50)
    
    # Load classifier
    if classifier.load():
        print(f"[Classifier] Ready with {len(classifier.labels)} classes")
    else:
        print("[Classifier] Not loaded - will relay Pi data without inference")
    
    print()
    print(f"Pi WebSocket: ws://{pi_ip}:{PI_PORT}")
    print(f"App WebSocket: ws://0.0.0.0:{LOCAL_PORT}")
    print()
    print("Connect your app to this PC's IP on port 8766")
    print("=" * 50)
    
    # Run both tasks
    await asyncio.gather(
        connect_to_pi(pi_ip),
        start_app_server(),
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LiftIQ PC Inference Server")
    parser.add_argument("--pi-ip", required=True, help="Raspberry Pi IP address")
    parser.add_argument("--pi-port", type=int, default=8765, help="Pi WebSocket port")
    parser.add_argument("--local-port", type=int, default=8766, help="Local server port for app")
    args = parser.parse_args()
    
    PI_PORT = args.pi_port
    LOCAL_PORT = args.local_port
    
    asyncio.run(main(args.pi_ip))