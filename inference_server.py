"""
LiftIQ PC Inference Server with Physics Pipeline

Connects to Pi's WebSocket, runs:
- Lift classification (Model 3)
- Velocity & ROM estimation (Model 2)
- Form metrics

Architecture:
  [IMU] → [Pi:8765] → [This PC:8766] → [React Native App]
                         ↓
                    TFLite Model + Physics Pipeline

Usage:
  python inference_server.py --pi-ip 192.168.1.100

Requirements:
  pip install websockets numpy tensorflow
"""

import asyncio
import json
import argparse
import time
import math
from collections import deque
from pathlib import Path

import numpy as np
import websockets

# =============================================================================
# Configuration
# =============================================================================

PI_PORT = 8765
LOCAL_PORT = 8766

MODEL_PATH = "ml/models/lift_classifier.tflite"
METADATA_PATH = "ml/models/lift_classifier_metadata.json"

# Classifier config
WINDOW_SAMPLES = 250
CLASSIFIER_INTERVAL = 0.5
CONFIDENCE_THRESHOLD = 0.6

# Physics config
SAMPLE_RATE = 10  # Pi sends at ~10Hz (rep_update every 0.1s)
GRAVITY = 9.81  # m/s²
ZUPT_THRESHOLD = 0.15  # m/s² - if accel magnitude is within this of gravity, assume stationary
ZUPT_GYRO_THRESHOLD = 0.5  # rad/s - if gyro magnitude below this, more likely stationary
VELOCITY_DECAY = 0.98  # Decay factor to prevent drift


# =============================================================================
# Madgwick Orientation Filter
# =============================================================================

class MadgwickFilter:
    """
    Madgwick AHRS algorithm for orientation estimation.
    Fuses accelerometer and gyroscope to estimate orientation as quaternion.
    """
    
    def __init__(self, sample_rate=10, beta=0.1):
        self.sample_rate = sample_rate
        self.beta = beta  # Filter gain (higher = trust accel more)
        # Quaternion: [w, x, y, z]
        self.q = np.array([1.0, 0.0, 0.0, 0.0])
    
    def update(self, gx, gy, gz, ax, ay, az, dt=None):
        """
        Update orientation with new IMU readings.
        gx, gy, gz: gyroscope in rad/s
        ax, ay, az: accelerometer in m/s² (or g's, will normalize)
        """
        if dt is None:
            dt = 1.0 / self.sample_rate
        
        q = self.q
        
        # Normalize accelerometer
        a_norm = math.sqrt(ax*ax + ay*ay + az*az)
        if a_norm < 0.001:
            return self.q
        ax, ay, az = ax/a_norm, ay/a_norm, az/a_norm
        
        # Quaternion components
        q0, q1, q2, q3 = q[0], q[1], q[2], q[3]
        
        # Auxiliary variables
        _2q0 = 2.0 * q0
        _2q1 = 2.0 * q1
        _2q2 = 2.0 * q2
        _2q3 = 2.0 * q3
        _4q0 = 4.0 * q0
        _4q1 = 4.0 * q1
        _4q2 = 4.0 * q2
        _8q1 = 8.0 * q1
        _8q2 = 8.0 * q2
        q0q0 = q0 * q0
        q1q1 = q1 * q1
        q2q2 = q2 * q2
        q3q3 = q3 * q3
        
        # Gradient descent step
        s0 = _4q0 * q2q2 + _2q2 * ax + _4q0 * q1q1 - _2q1 * ay
        s1 = _4q1 * q3q3 - _2q3 * ax + 4.0 * q0q0 * q1 - _2q0 * ay - _4q1 + _8q1 * q1q1 + _8q1 * q2q2 + _4q1 * az
        s2 = 4.0 * q0q0 * q2 + _2q0 * ax + _4q2 * q3q3 - _2q3 * ay - _4q2 + _8q2 * q1q1 + _8q2 * q2q2 + _4q2 * az
        s3 = 4.0 * q1q1 * q3 - _2q1 * ax + 4.0 * q2q2 * q3 - _2q2 * ay
        
        # Normalize gradient
        s_norm = math.sqrt(s0*s0 + s1*s1 + s2*s2 + s3*s3)
        if s_norm > 0.001:
            s0, s1, s2, s3 = s0/s_norm, s1/s_norm, s2/s_norm, s3/s_norm
        
        # Gyroscope quaternion derivative
        qDot0 = 0.5 * (-q1 * gx - q2 * gy - q3 * gz)
        qDot1 = 0.5 * (q0 * gx + q2 * gz - q3 * gy)
        qDot2 = 0.5 * (q0 * gy - q1 * gz + q3 * gx)
        qDot3 = 0.5 * (q0 * gz + q1 * gy - q2 * gx)
        
        # Apply feedback
        qDot0 -= self.beta * s0
        qDot1 -= self.beta * s1
        qDot2 -= self.beta * s2
        qDot3 -= self.beta * s3
        
        # Integrate
        q0 += qDot0 * dt
        q1 += qDot1 * dt
        q2 += qDot2 * dt
        q3 += qDot3 * dt
        
        # Normalize quaternion
        q_norm = math.sqrt(q0*q0 + q1*q1 + q2*q2 + q3*q3)
        self.q = np.array([q0/q_norm, q1/q_norm, q2/q_norm, q3/q_norm])
        
        return self.q
    
    def get_euler(self):
        """Get roll, pitch, yaw in radians."""
        q0, q1, q2, q3 = self.q
        
        # Roll (x-axis rotation)
        sinr_cosp = 2 * (q0 * q1 + q2 * q3)
        cosr_cosp = 1 - 2 * (q1 * q1 + q2 * q2)
        roll = math.atan2(sinr_cosp, cosr_cosp)
        
        # Pitch (y-axis rotation)
        sinp = 2 * (q0 * q2 - q3 * q1)
        if abs(sinp) >= 1:
            pitch = math.copysign(math.pi / 2, sinp)
        else:
            pitch = math.asin(sinp)
        
        # Yaw (z-axis rotation)
        siny_cosp = 2 * (q0 * q3 + q1 * q2)
        cosy_cosp = 1 - 2 * (q2 * q2 + q3 * q3)
        yaw = math.atan2(siny_cosp, cosy_cosp)
        
        return roll, pitch, yaw
    
    def remove_gravity(self, ax, ay, az):
        """Remove gravity from accelerometer reading using current orientation."""
        q0, q1, q2, q3 = self.q
        
        # Gravity vector in world frame is [0, 0, 1] (normalized)
        # Rotate to sensor frame using quaternion
        gx = 2 * (q1 * q3 - q0 * q2)
        gy = 2 * (q0 * q1 + q2 * q3)
        gz = q0*q0 - q1*q1 - q2*q2 + q3*q3
        
        # Remove gravity (assuming accel is in g's, multiply by GRAVITY for m/s²)
        lin_ax = ax - gx * GRAVITY
        lin_ay = ay - gy * GRAVITY
        lin_az = az - gz * GRAVITY
        
        return lin_ax, lin_ay, lin_az
    
    def reset(self):
        """Reset to initial orientation."""
        self.q = np.array([1.0, 0.0, 0.0, 0.0])


# =============================================================================
# Velocity & ROM Estimator
# =============================================================================

class VelocityEstimator:
    """
    Estimates velocity and displacement from linear acceleration.
    Uses ZUPT (Zero Velocity Update) to correct drift.
    """
    
    def __init__(self):
        self.velocity = np.array([0.0, 0.0, 0.0])  # m/s
        self.displacement = np.array([0.0, 0.0, 0.0])  # m
        self.rep_start_pos = np.array([0.0, 0.0, 0.0])
        self.peak_velocity = 0.0
        self.velocity_samples = []
        self.is_stationary = True
        self.stationary_count = 0
    
    def update(self, lin_ax, lin_ay, lin_az, gyro_mag, dt=0.1):
        """
        Update velocity and displacement.
        lin_ax, lin_ay, lin_az: linear acceleration (gravity removed) in m/s²
        gyro_mag: gyroscope magnitude for ZUPT detection
        """
        accel = np.array([lin_ax, lin_ay, lin_az])
        accel_mag = np.linalg.norm(accel)
        
        # ZUPT detection: if acceleration is near zero and gyro is low, assume stationary
        if accel_mag < ZUPT_THRESHOLD and gyro_mag < ZUPT_GYRO_THRESHOLD:
            self.stationary_count += 1
            if self.stationary_count > 3:  # Need consecutive stationary samples
                self.velocity *= 0.5  # Rapidly decay velocity
                self.is_stationary = True
        else:
            self.stationary_count = 0
            self.is_stationary = False
        
        # Integrate acceleration to get velocity
        self.velocity += accel * dt
        
        # Apply decay to prevent drift
        self.velocity *= VELOCITY_DECAY
        
        # Track peak velocity magnitude
        vel_mag = np.linalg.norm(self.velocity)
        if vel_mag > self.peak_velocity:
            self.peak_velocity = vel_mag
        
        # Store velocity samples for averaging
        self.velocity_samples.append(vel_mag)
        
        # Integrate velocity to get displacement
        self.displacement += self.velocity * dt
        
        return self.velocity, vel_mag
    
    def get_vertical_velocity(self):
        """Get velocity in the Z (vertical) direction."""
        return self.velocity[2]
    
    def get_rom(self):
        """Get range of motion since rep start."""
        return np.linalg.norm(self.displacement - self.rep_start_pos)
    
    def get_vertical_rom(self):
        """Get vertical displacement since rep start."""
        return abs(self.displacement[2] - self.rep_start_pos[2])
    
    def get_mean_velocity(self):
        """Get mean velocity magnitude."""
        if not self.velocity_samples:
            return 0.0
        return sum(self.velocity_samples) / len(self.velocity_samples)
    
    def start_rep(self):
        """Mark start of a new rep."""
        self.rep_start_pos = self.displacement.copy()
        self.peak_velocity = 0.0
        self.velocity_samples = []
    
    def reset(self):
        """Full reset."""
        self.velocity = np.array([0.0, 0.0, 0.0])
        self.displacement = np.array([0.0, 0.0, 0.0])
        self.rep_start_pos = np.array([0.0, 0.0, 0.0])
        self.peak_velocity = 0.0
        self.velocity_samples = []
        self.is_stationary = True
        self.stationary_count = 0


# =============================================================================
# Rep Phase Detector
# =============================================================================

class RepPhaseDetector:
    """
    Detects concentric vs eccentric phases within a rep.
    Concentric = bar moving up (positive vertical velocity)
    Eccentric = bar moving down (negative vertical velocity)
    """
    
    def __init__(self):
        self.phase = "unknown"  # "concentric", "eccentric", "unknown"
        self.phase_start_time = 0
        self.concentric_time = 0
        self.eccentric_time = 0
        self.phase_velocities = {"concentric": [], "eccentric": []}
        self.rep_start_time = None
        self.peak_time = None
        self.velocity_history = deque(maxlen=5)  # Smooth velocity
    
    def update(self, vertical_velocity, t):
        """Update phase based on vertical velocity."""
        self.velocity_history.append(vertical_velocity)
        smoothed_vel = sum(self.velocity_history) / len(self.velocity_history)
        
        if abs(smoothed_vel) < 0.05:  # Near zero
            return self.phase
        
        new_phase = "concentric" if smoothed_vel > 0 else "eccentric"
        
        if new_phase != self.phase and self.phase != "unknown":
            # Phase transition
            phase_duration = t - self.phase_start_time
            if self.phase == "concentric":
                self.concentric_time += phase_duration
            elif self.phase == "eccentric":
                self.eccentric_time += phase_duration
            
            if new_phase == "eccentric" and self.phase == "concentric":
                self.peak_time = t
        
        if new_phase != self.phase:
            self.phase = new_phase
            self.phase_start_time = t
        
        # Track velocities per phase
        self.phase_velocities[self.phase].append(abs(smoothed_vel))
        
        return self.phase
    
    def start_rep(self, t):
        """Mark start of new rep."""
        self.phase = "unknown"
        self.phase_start_time = t
        self.concentric_time = 0
        self.eccentric_time = 0
        self.phase_velocities = {"concentric": [], "eccentric": []}
        self.rep_start_time = t
        self.peak_time = None
        self.velocity_history.clear()
    
    def end_rep(self, t):
        """Finalize rep timing."""
        if self.phase != "unknown":
            phase_duration = t - self.phase_start_time
            if self.phase == "concentric":
                self.concentric_time += phase_duration
            elif self.phase == "eccentric":
                self.eccentric_time += phase_duration
    
    def get_mean_concentric_velocity(self):
        vels = self.phase_velocities.get("concentric", [])
        return sum(vels) / len(vels) if vels else 0.0
    
    def get_mean_eccentric_velocity(self):
        vels = self.phase_velocities.get("eccentric", [])
        return sum(vels) / len(vels) if vels else 0.0


# =============================================================================
# Stability Analyzer
# =============================================================================

class StabilityAnalyzer:
    """
    Analyzes rep stability based on gyro variance (wobble).
    """
    
    def __init__(self):
        self.gyro_samples = []  # [gx, gy, gz] during rep
        self.accel_samples = []  # [ax, ay, az] during rep
    
    def add_sample(self, gx, gy, gz, ax, ay, az):
        """Add IMU sample during rep."""
        self.gyro_samples.append([gx, gy, gz])
        self.accel_samples.append([ax, ay, az])
    
    def get_stability_score(self):
        """
        Calculate stability score (0-100).
        Lower gyro variance = more stable = higher score.
        """
        if len(self.gyro_samples) < 5:
            return 100.0
        
        gyro_array = np.array(self.gyro_samples)
        
        # Calculate variance in each axis
        var_x = np.var(gyro_array[:, 0])
        var_y = np.var(gyro_array[:, 1])
        var_z = np.var(gyro_array[:, 2])
        
        total_var = var_x + var_y + var_z
        
        # Map variance to score (empirical thresholds)
        # Low variance (< 0.1) = score 100
        # High variance (> 2.0) = score 0
        score = max(0, min(100, 100 - (total_var * 50)))
        
        return score
    
    def get_wobble_metric(self):
        """Get raw wobble metric (gyro variance)."""
        if len(self.gyro_samples) < 5:
            return 0.0
        
        gyro_array = np.array(self.gyro_samples)
        return float(np.var(gyro_array))
    
    def reset(self):
        """Reset for new rep."""
        self.gyro_samples = []
        self.accel_samples = []


# =============================================================================
# Lift Classifier (same as before)
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
        if not Path(self.model_path).exists():
            print(f"[Classifier] Model not found: {self.model_path}")
            return False
            
        try:
            import tensorflow as tf
            self.interpreter = tf.lite.Interpreter(model_path=self.model_path)
            self.interpreter.allocate_tensors()
            self.input_details = self.interpreter.get_input_details()
            self.output_details = self.interpreter.get_output_details()
            print(f"[Classifier] Loaded: {self.model_path}")
        except Exception as e:
            print(f"[Classifier] Failed: {e}")
            return False
        
        if Path(self.metadata_path).exists():
            try:
                with open(self.metadata_path) as f:
                    meta = json.load(f)
                self.labels = meta.get('labels', [])
                self.label_names = meta.get('label_names', {})
                self.norm_mean = np.array(meta.get('norm_mean', [0]*6), dtype=np.float32)
                self.norm_std = np.array(meta.get('norm_std', [1]*6), dtype=np.float32)
                print(f"[Classifier] {len(self.labels)} classes loaded")
            except Exception as e:
                print(f"[Classifier] Metadata error: {e}")
        
        self.enabled = True
        return True
    
    def add_sample(self, ax, ay, az, gx, gy, gz):
        self.buffer.append([ax, ay, az, gx, gy, gz])
    
    def clear_buffer(self):
        self.buffer.clear()
    
    def predict(self):
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
            
            top_indices = np.argsort(output)[-3:][::-1]
            all_probs = {self.labels[i]: round(float(output[i]), 3) for i in top_indices if i < len(self.labels)}
            
            label = self.labels[pred_idx] if confidence >= CONFIDENCE_THRESHOLD and pred_idx < len(self.labels) else None
            return label, confidence, all_probs
        except Exception as e:
            print(f"[Classifier] Error: {e}")
            return None, 0.0, {}


# =============================================================================
# Physics Pipeline (combines all components)
# =============================================================================

class PhysicsPipeline:
    """
    Full physics pipeline for velocity, ROM, and form analysis.
    """
    
    def __init__(self):
        self.orientation = MadgwickFilter(sample_rate=SAMPLE_RATE, beta=0.1)
        self.velocity_est = VelocityEstimator()
        self.phase_detector = RepPhaseDetector()
        self.stability = StabilityAnalyzer()
        
        self.last_t = None
        self.current_velocity = 0.0
        self.current_rom = 0.0
        self.rep_active = False
        
        # Per-rep metrics
        self.rep_metrics = {
            "peak_velocity_ms": 0.0,
            "mean_velocity_ms": 0.0,
            "mean_concentric_velocity_ms": 0.0,
            "mean_eccentric_velocity_ms": 0.0,
            "rom_m": 0.0,
            "rom_cm": 0.0,
            "concentric_time_sec": 0.0,
            "eccentric_time_sec": 0.0,
            "stability_score": 100.0,
            "wobble": 0.0,
        }
    
    def update(self, ax, ay, az, gx, gy, gz, t):
        """
        Process one IMU sample.
        ax, ay, az: accelerometer (m/s² or g's - will normalize)
        gx, gy, gz: gyroscope (rad/s)
        t: timestamp
        """
        # Calculate dt
        dt = 0.1  # Default 10Hz
        if self.last_t is not None:
            dt = max(0.01, min(0.5, t - self.last_t))
        self.last_t = t
        
        # Check if accel is in g's (magnitude ~1) or m/s² (magnitude ~9.8)
        accel_mag = math.sqrt(ax*ax + ay*ay + az*az)
        if accel_mag < 2.0:  # Likely in g's
            ax, ay, az = ax * GRAVITY, ay * GRAVITY, az * GRAVITY
        
        # Update orientation
        self.orientation.update(gx, gy, gz, ax, ay, az, dt)
        
        # Remove gravity to get linear acceleration
        lin_ax, lin_ay, lin_az = self.orientation.remove_gravity(ax, ay, az)
        
        # Gyro magnitude for ZUPT
        gyro_mag = math.sqrt(gx*gx + gy*gy + gz*gz)
        
        # Update velocity
        velocity, vel_mag = self.velocity_est.update(lin_ax, lin_ay, lin_az, gyro_mag, dt)
        self.current_velocity = vel_mag
        
        # Update ROM
        self.current_rom = self.velocity_est.get_vertical_rom()
        
        # Update phase detector
        vertical_vel = self.velocity_est.get_vertical_velocity()
        self.phase_detector.update(vertical_vel, t)
        
        # Add to stability analyzer if rep is active
        if self.rep_active:
            self.stability.add_sample(gx, gy, gz, ax, ay, az)
        
        # Get euler angles
        roll, pitch, yaw = self.orientation.get_euler()
        
        return {
            "velocity_ms": round(vel_mag, 3),
            "vertical_velocity_ms": round(vertical_vel, 3),
            "rom_m": round(self.current_rom, 4),
            "rom_cm": round(self.current_rom * 100, 1),
            "phase": self.phase_detector.phase,
            "roll_deg": round(math.degrees(roll), 1),
            "pitch_deg": round(math.degrees(pitch), 1),
            "yaw_deg": round(math.degrees(yaw), 1),
            "is_stationary": self.velocity_est.is_stationary,
        }
    
    def start_rep(self, t):
        """Called when a new rep starts."""
        self.rep_active = True
        self.velocity_est.start_rep()
        self.phase_detector.start_rep(t)
        self.stability.reset()
    
    def end_rep(self, t):
        """Called when rep ends. Returns rep metrics."""
        self.rep_active = False
        self.phase_detector.end_rep(t)
        
        self.rep_metrics = {
            "peak_velocity_ms": round(self.velocity_est.peak_velocity, 3),
            "mean_velocity_ms": round(self.velocity_est.get_mean_velocity(), 3),
            "mean_concentric_velocity_ms": round(self.phase_detector.get_mean_concentric_velocity(), 3),
            "mean_eccentric_velocity_ms": round(self.phase_detector.get_mean_eccentric_velocity(), 3),
            "rom_m": round(self.velocity_est.get_rom(), 4),
            "rom_cm": round(self.velocity_est.get_rom() * 100, 1),
            "concentric_time_sec": round(self.phase_detector.concentric_time, 3),
            "eccentric_time_sec": round(self.phase_detector.eccentric_time, 3),
            "stability_score": round(self.stability.get_stability_score(), 1),
            "wobble": round(self.stability.get_wobble_metric(), 4),
        }
        
        return self.rep_metrics
    
    def reset(self):
        """Full reset for new session."""
        self.orientation.reset()
        self.velocity_est.reset()
        self.stability.reset()
        self.last_t = None
        self.rep_active = False


# =============================================================================
# Global State
# =============================================================================

classifier = LiftClassifier(MODEL_PATH, METADATA_PATH)
physics = PhysicsPipeline()
app_clients = set()

current_state = {
    "type": "rep_update",
    "t": 0.0,
    "reps": 0,
    "state": "WAITING",
    "recording": False,
    "gyro_filt": 0.0,
    # Physics pipeline outputs
    "velocity_ms": 0.0,
    "rom_cm": 0.0,
    "phase": "unknown",
    "roll_deg": 0.0,
    "pitch_deg": 0.0,
    # Classification
    "detected_lift": None,
    "lift_confidence": 0.0,
}

session_votes = {}
session_active = False
last_rep_count = 0


# =============================================================================
# Broadcast to App
# =============================================================================

async def broadcast_to_apps(msg: dict):
    if not app_clients:
        return
    data = json.dumps(msg)
    dead = []
    for ws in list(app_clients):
        try:
            await ws.send(data)
        except:
            dead.append(ws)
    for ws in dead:
        app_clients.discard(ws)


# =============================================================================
# Pi WebSocket Client
# =============================================================================

async def connect_to_pi(pi_ip: str):
    global current_state, session_votes, session_active, last_rep_count
    
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
                    t = msg.get("t", 0)
                    
                    # Handle rep_update
                    if msg_type == "rep_update":
                        ax = msg.get("ax", 0)
                        ay = msg.get("ay", 0)
                        az = msg.get("az", 0)
                        gx = msg.get("gx", 0)
                        gy = msg.get("gy", 0)
                        gz = msg.get("gz", 0)
                        
                        # Add to classifier
                        classifier.add_sample(ax, ay, az, gx, gy, gz)
                        
                        # Run physics pipeline
                        physics_data = physics.update(ax, ay, az, gx, gy, gz, t)
                        
                        # Track session state
                        was_active = session_active
                        session_active = msg.get("recording", False)
                        
                        if session_active and not was_active:
                            # Session started
                            session_votes = {}
                            last_rep_count = 0
                            classifier.clear_buffer()
                            physics.reset()
                            print("[Session] Started")
                        
                        if not session_active and was_active:
                            # Session ended
                            if session_votes:
                                best = max(session_votes, key=session_votes.get)
                                print(f"[Session] Ended - Final lift: {best}")
                        
                        # Detect new rep
                        current_reps = msg.get("reps", 0)
                        if current_reps > last_rep_count and session_active:
                            # New rep detected
                            if last_rep_count > 0:
                                # End previous rep
                                rep_metrics = physics.end_rep(t)
                                print(f"[Rep {last_rep_count}] vel={rep_metrics['peak_velocity_ms']}m/s, ROM={rep_metrics['rom_cm']}cm, stability={rep_metrics['stability_score']}")
                            
                            # Start new rep
                            physics.start_rep(t)
                            last_rep_count = current_reps
                        
                        # Run classifier periodically
                        now = time.time()
                        if now - last_inference >= CLASSIFIER_INTERVAL:
                            label, conf, probs = classifier.predict()
                            if label:
                                current_state["detected_lift"] = label
                                current_state["lift_confidence"] = round(conf, 2)
                                if session_active:
                                    session_votes[label] = session_votes.get(label, 0) + 1
                            last_inference = now
                        
                        # Update current state
                        current_state.update({
                            "type": "rep_update",
                            "t": t,
                            "reps": current_reps,
                            "state": msg.get("state", "WAITING"),
                            "recording": session_active,
                            "gyro_filt": msg.get("gyro_filt", 0),
                            # From Pi
                            "tut_sec": msg.get("tut_sec", 0),
                            "avg_tempo_sec": msg.get("avg_tempo_sec"),
                            "output_loss_pct": msg.get("output_loss_pct"),
                            # Physics pipeline
                            "velocity_ms": physics_data["velocity_ms"],
                            "rom_cm": physics_data["rom_cm"],
                            "phase": physics_data["phase"],
                            "roll_deg": physics_data["roll_deg"],
                            "pitch_deg": physics_data["pitch_deg"],
                            "is_stationary": physics_data["is_stationary"],
                        })
                        
                        await broadcast_to_apps(current_state)
                    
                    # Handle rep_event from Pi
                    elif msg_type == "rep_event":
                        # Add our physics metrics
                        rep_metrics = physics.rep_metrics
                        msg.update({
                            "peak_velocity_ms": rep_metrics["peak_velocity_ms"],
                            "mean_velocity_ms": rep_metrics["mean_velocity_ms"],
                            "mean_concentric_velocity_ms": rep_metrics["mean_concentric_velocity_ms"],
                            "mean_eccentric_velocity_ms": rep_metrics["mean_eccentric_velocity_ms"],
                            "rom_m": rep_metrics["rom_m"],
                            "rom_cm": rep_metrics["rom_cm"],
                            "concentric_time_sec": rep_metrics["concentric_time_sec"],
                            "eccentric_time_sec": rep_metrics["eccentric_time_sec"],
                            "stability_score": rep_metrics["stability_score"],
                            "detected_lift": current_state.get("detected_lift"),
                            "lift_confidence": current_state.get("lift_confidence"),
                        })
                        await broadcast_to_apps(msg)
                    
                    # Forward other messages
                    elif msg_type in ("session_summary", "ack", "error", "status"):
                        msg["detected_lift"] = current_state.get("detected_lift")
                        msg["lift_confidence"] = current_state.get("lift_confidence")
                        await broadcast_to_apps(msg)
                    
                    else:
                        await broadcast_to_apps(msg)
        
        except websockets.exceptions.ConnectionClosed:
            print(f"[Pi] Connection closed")
        except ConnectionRefusedError:
            print(f"[Pi] Connection refused")
        except Exception as e:
            print(f"[Pi] Error: {e}")
        
        print(f"[Pi] Reconnecting in {reconnect_delay}s...")
        await asyncio.sleep(reconnect_delay)
        reconnect_delay = min(reconnect_delay * 2, 30)


# =============================================================================
# App WebSocket Server
# =============================================================================

async def handle_app_client(ws):
    app_clients.add(ws)
    print(f"[App] Client connected: {ws.remote_address}")
    
    try:
        await ws.send(json.dumps(current_state))
        async for raw in ws:
            try:
                msg = json.loads(raw)
                print(f"[App] Received: {msg.get('type', 'unknown')}")
            except:
                continue
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        app_clients.discard(ws)
        print(f"[App] Client disconnected")


async def start_app_server():
    print(f"[App] Server listening on ws://0.0.0.0:{LOCAL_PORT}")
    server = await websockets.serve(handle_app_client, "0.0.0.0", LOCAL_PORT, ping_interval=20, ping_timeout=20)
    await server.wait_closed()


# =============================================================================
# Main
# =============================================================================

async def main(pi_ip: str):
    print("=" * 60)
    print("LiftIQ PC Inference Server + Physics Pipeline")
    print("=" * 60)
    
    if classifier.load():
        print(f"[Classifier] Ready")
    else:
        print("[Classifier] Not available")
    
    print(f"[Physics] Madgwick filter + velocity/ROM estimation ready")
    print()
    print(f"Pi: ws://{pi_ip}:{PI_PORT}")
    print(f"App: ws://0.0.0.0:{LOCAL_PORT}")
    print()
    print("Metrics now include:")
    print("  - velocity_ms (real m/s)")
    print("  - rom_cm (real displacement)")
    print("  - phase (concentric/eccentric)")
    print("  - stability_score (0-100)")
    print("=" * 60)
    
    await asyncio.gather(
        connect_to_pi(pi_ip),
        start_app_server(),
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pi-ip", required=True, help="Raspberry Pi IP")
    parser.add_argument("--pi-port", type=int, default=8765)
    parser.add_argument("--local-port", type=int, default=8766)
    args = parser.parse_args()
    
    PI_PORT = args.pi_port
    LOCAL_PORT = args.local_port
    
    asyncio.run(main(args.pi_ip))