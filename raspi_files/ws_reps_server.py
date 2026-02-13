"""
LiftIQ WebSocket Server with ML Pipeline

This is the main server that runs on the Raspberry Pi. It:
1. Reads IMU data (accelerometer + gyroscope)
2. Processes through ML pipeline (orientation -> gravity removal -> velocity -> ROM)
3. Detects reps and computes metrics
4. Streams data to React Native app via WebSocket

New in this version:
- Bar velocity estimation (m/s)
- Range of motion tracking (meters)
- Orientation-based analysis (roll, pitch, yaw)

Usage:
    python ws_server.py
"""

import asyncio
import json
import time
import os
import platform
import zipfile
import threading
from collections import deque
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

import websockets
import numpy as np

try:
    from tflite_runtime.interpreter import Interpreter as TFLiteInterpreter
except Exception:
    TFLiteInterpreter = None
    try:
        import tensorflow as tf
        TFLiteInterpreter = tf.lite.Interpreter
    except Exception:
        TFLiteInterpreter = None

# Existing imports
from imu_driver import IMU
from rep_counter import RepCounter

# NEW: ML Pipeline imports
from pi.orientation import OrientationFilter
from pi.gravity import GravityRemover
from pi.velocity import VelocityEstimator
from pi.rom import ROMEstimator

# =============================================================================
# Configuration
# =============================================================================

HOST = "0.0.0.0"
PORT = 8765

BASE_DIR = os.path.dirname(__file__)
SESS_DIR = os.path.join(BASE_DIR, "sessions")
EXPORT_DIR = os.path.join(BASE_DIR, "exports")
os.makedirs(SESS_DIR, exist_ok=True)
os.makedirs(EXPORT_DIR, exist_ok=True)

# Sample rate (should match IMU configuration)
SAMPLE_RATE_HZ = 50.0

# Optional TFLite lift classification (server-side inference)
ENABLE_TFLITE_INFERENCE = os.getenv("LIFTIQ_ENABLE_TFLITE", "0").lower() in ("1", "true", "yes")
LIFT_MODEL_PATH = os.getenv("LIFTIQ_LIFT_MODEL_PATH", "").strip()
LIFT_METADATA_PATH = os.getenv("LIFTIQ_LIFT_METADATA_PATH", "").strip()
LIFT_INFER_EVERY_N = max(1, int(os.getenv("LIFTIQ_LIFT_INFER_EVERY_N", "25")))  # ~2 Hz at 50 Hz

# State constants
STATE_CALIBRATING = "CALIBRATING"
STATE_WAITING = "WAITING"
STATE_MOVING = "MOVING"

# =============================================================================
# Global State
# =============================================================================

clients = set()

LAST_STATUS = {
    "type": "status",
    "state": STATE_WAITING,
    "reps": 0,
    "recording": False,
    "t": 0.0,
    "gyro_filt": 0.0,
    "tut_sec": 0.0,
    "avg_tempo_sec": None,
    "output_loss_pct": None,
    "avg_peak_speed_proxy": None,
    "speed_loss_pct": None,
    # NEW fields
    "velocity": 0.0,
    "displacement": 0.0,
    "roll": 0.0,
    "pitch": 0.0,
    "yaw": 0.0,
    "avg_rom_m": None,
    "rom_loss_pct": None,
    "detected_lift": None,
    "lift_confidence": 0.0,
}

RESET_REQUESTED = False
SERVER_DEVICE_INFO = {}
SERVER_THRESHOLDS = {}
LAST_DETECTED_LIFT = None
LAST_LIFT_CONFIDENCE = 0.0

_http_thread = None
_http_port = None


# =============================================================================
# Helpers
# =============================================================================

def iso_from_ts(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def make_session_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")


def read_pi_model() -> str:
    try:
        with open("/proc/device-tree/model", "r") as f:
            return f.read().strip("\x00").strip()
    except Exception:
        return platform.platform()


def safe_getattr(obj, name, default=None):
    try:
        return getattr(obj, name)
    except Exception:
        return default


def json_safe(x):
    if x is None:
        return None
    if isinstance(x, (str, int, float, bool)):
        return x
    if isinstance(x, (list, tuple)):
        return [json_safe(v) for v in x]
    if isinstance(x, dict):
        return {str(k): json_safe(v) for k, v in x.items()}
    return str(x)


def clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


def compute_loss_pct(values):
    """Loss % from first to last (fatigue proxy)."""
    if not values or len(values) < 2:
        return None
    first = float(values[0])
    last = float(values[-1])
    if first <= 0:
        return None
    loss = (1.0 - (last / first)) * 100.0
    return round(clamp(loss, 0.0, 100.0), 2)


def is_command_message(msg: dict) -> bool:
    return msg.get("type") in ("cmd", "command")


def _read_json(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _existing_path(candidates):
    for path in candidates:
        if path and os.path.exists(path):
            return path
    return None


class LiftClassifierTFLite:
    """Optional TFLite exercise classifier for server-side inference."""

    def __init__(self, enabled: bool = False):
        self.requested = bool(enabled)
        self.enabled = False
        self.reason = None
        self.model_path = None
        self.metadata_path = None

        self.labels = []
        self.num_classes = 0
        self.window_samples = 250
        self.conf_threshold = 0.6
        self.norm_mean = np.zeros((6,), dtype=np.float32)
        self.norm_std = np.ones((6,), dtype=np.float32)
        self.infer_stride = LIFT_INFER_EVERY_N

        self._interpreter = None
        self._input_index = None
        self._output_index = None
        self._input_dtype = np.float32
        self._input_scale = 1.0
        self._input_zero_point = 0
        self._output_scale = 1.0
        self._output_zero_point = 0

        self._buffer = deque(maxlen=self.window_samples)
        self._sample_count = 0
        self._last_infer_at = 0

        self.current_label = None
        self.current_confidence = 0.0
        self._session_vote_sum = {}
        self._session_best_conf = {}

        if self.requested:
            self._try_init()

    def _find_model_path(self):
        candidates = [
            LIFT_MODEL_PATH,
            os.path.join(BASE_DIR, "models", "lift_classifier.tflite"),
            os.path.join(BASE_DIR, "lift_classifier.tflite"),
            os.path.join(BASE_DIR, "..", "ml", "models", "lift_classifier.tflite"),
        ]
        return _existing_path(candidates)

    def _find_metadata_path(self):
        candidates = [
            LIFT_METADATA_PATH,
            os.path.join(BASE_DIR, "models", "lift_classifier_metadata.json"),
            os.path.join(BASE_DIR, "lift_classifier_metadata.json"),
            os.path.join(BASE_DIR, "..", "ml", "models", "lift_classifier_metadata.json"),
            os.path.join(BASE_DIR, "..", "ml", "data", "recgym_processed", "metadata.json"),
        ]
        return _existing_path(candidates)

    def _try_load_labels_fallback(self):
        fallback = _existing_path([
            os.path.join(BASE_DIR, "..", "ml", "data", "recgym_processed", "metadata.json"),
        ])
        if fallback:
            meta = _read_json(fallback) or {}
            labels = meta.get("labels") or []
            if labels:
                self.labels = list(labels)
                self.num_classes = len(self.labels)

    def _try_init(self):
        if TFLiteInterpreter is None:
            self.reason = "tflite_runtime_not_available"
            return

        self.model_path = self._find_model_path()
        if not self.model_path:
            self.reason = "model_not_found"
            return

        self.metadata_path = self._find_metadata_path()
        metadata = _read_json(self.metadata_path) if self.metadata_path else {}
        metadata = metadata or {}

        labels = metadata.get("labels") or []
        if labels:
            self.labels = list(labels)
            self.num_classes = len(self.labels)

        self.window_samples = int(metadata.get("window_samples", self.window_samples))
        self.conf_threshold = float(metadata.get("confidence_threshold", self.conf_threshold))

        mean = metadata.get("norm_mean")
        std = metadata.get("norm_std")
        if isinstance(mean, list) and len(mean) == 6:
            self.norm_mean = np.asarray(mean, dtype=np.float32)
        if isinstance(std, list) and len(std) == 6:
            arr = np.asarray(std, dtype=np.float32)
            self.norm_std = np.where(arr == 0.0, 1.0, arr)

        self._buffer = deque(maxlen=self.window_samples)
        self._try_load_labels_fallback()

        try:
            self._interpreter = TFLiteInterpreter(model_path=self.model_path)
            self._interpreter.allocate_tensors()

            input_info = self._interpreter.get_input_details()[0]
            output_info = self._interpreter.get_output_details()[0]
            self._input_index = input_info["index"]
            self._output_index = output_info["index"]
            self._input_dtype = input_info["dtype"]

            in_quant = input_info.get("quantization", (0.0, 0))
            if in_quant and len(in_quant) == 2 and in_quant[0] not in (0, 0.0):
                self._input_scale, self._input_zero_point = float(in_quant[0]), int(in_quant[1])

            out_quant = output_info.get("quantization", (0.0, 0))
            if out_quant and len(out_quant) == 2 and out_quant[0] not in (0, 0.0):
                self._output_scale, self._output_zero_point = float(out_quant[0]), int(out_quant[1])
        except Exception as e:
            self.reason = f"init_failed:{e}"
            self._interpreter = None
            return

        self.enabled = True
        self.reason = None

    def reset_stream(self):
        self._buffer.clear()
        self._sample_count = 0
        self._last_infer_at = 0
        self.current_label = None
        self.current_confidence = 0.0

    def start_session(self):
        self._session_vote_sum = {}
        self._session_best_conf = {}

    def _record_session_vote(self, label: str, confidence: float):
        if not label or label == "unknown":
            return
        self._session_vote_sum[label] = self._session_vote_sum.get(label, 0.0) + float(confidence)
        self._session_best_conf[label] = max(self._session_best_conf.get(label, 0.0), float(confidence))

    def session_prediction(self):
        if not self._session_vote_sum:
            return None, 0.0
        top_label = max(self._session_vote_sum, key=self._session_vote_sum.get)
        return top_label, float(self._session_best_conf.get(top_label, 0.0))

    def push_sample(self, ax, ay, az, gx, gy, gz):
        if not self.enabled:
            return None

        self._buffer.append([ax, ay, az, gx, gy, gz])
        self._sample_count += 1

        if len(self._buffer) < self.window_samples:
            return None
        if (self._sample_count - self._last_infer_at) < self.infer_stride:
            return None
        self._last_infer_at = self._sample_count

        x = np.asarray(self._buffer, dtype=np.float32)
        x = (x - self.norm_mean) / self.norm_std
        x = np.expand_dims(x, axis=0)

        if self._input_dtype != np.float32:
            x_q = np.round((x / self._input_scale) + self._input_zero_point)
            if self._input_dtype == np.uint8:
                x = np.clip(x_q, 0, 255).astype(np.uint8)
            else:
                x = np.clip(x_q, -128, 127).astype(np.int8)
        else:
            x = x.astype(np.float32)

        try:
            self._interpreter.set_tensor(self._input_index, x)
            self._interpreter.invoke()
            y = self._interpreter.get_tensor(self._output_index)
        except Exception:
            return None

        y = np.asarray(y)[0]
        if y.dtype != np.float32 and self._output_scale not in (0.0, 0):
            y = (y.astype(np.float32) - self._output_zero_point) * self._output_scale
        else:
            y = y.astype(np.float32)

        pred_idx = int(np.argmax(y))
        confidence = float(y[pred_idx])
        label = self.labels[pred_idx] if pred_idx < len(self.labels) else str(pred_idx)

        if confidence < self.conf_threshold:
            label = "unknown"

        self.current_label = label
        self.current_confidence = confidence
        self._record_session_vote(label, confidence)

        return {
            "label": label,
            "confidence": confidence,
            "class_idx": pred_idx,
        }


# =============================================================================
# HTTP Server for Exports
# =============================================================================

def _start_export_http_server(port: int = 8000):
    global _http_thread, _http_port
    if _http_thread and _http_thread.is_alive():
        return _http_port

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=EXPORT_DIR, **kwargs)

        def log_message(self, fmt, *args):
            return

    httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    _http_port = port

    def _run():
        httpd.serve_forever()

    _http_thread = threading.Thread(target=_run, daemon=True)
    _http_thread.start()
    return _http_port


# =============================================================================
# History Helpers (unchanged from original)
# =============================================================================

def list_session_summaries(limit: int = 20):
    rows = []
    try:
        entries = os.listdir(SESS_DIR)
    except Exception:
        entries = []

    for name in entries:
        if not name.startswith("session_"):
            continue
        sdir = os.path.join(SESS_DIR, name)
        if not os.path.isdir(sdir):
            continue
        summary_path = os.path.join(sdir, "summary.json")
        summary = _read_json(summary_path)
        if not isinstance(summary, dict):
            continue

        session_id = summary.get("session_id") or name.replace("session_", "")
        rows.append({
            "session_id": session_id,
            "start_time": summary.get("start_time"),
            "end_time": summary.get("end_time"),
            "duration_sec": summary.get("duration_sec"),
            "total_reps": summary.get("total_reps"),
            "tut_sec": summary.get("tut_sec"),
            "avg_tempo_sec": summary.get("avg_tempo_sec"),
            "output_loss_pct": summary.get("output_loss_pct"),
            "avg_peak_speed_proxy": summary.get("avg_peak_speed_proxy"),
            "speed_loss_pct": summary.get("speed_loss_pct"),
            # NEW
            "avg_velocity_ms": summary.get("avg_velocity_ms"),
            "velocity_loss_pct": summary.get("velocity_loss_pct"),
            "avg_rom_m": summary.get("avg_rom_m"),
            "rom_loss_pct": summary.get("rom_loss_pct"),
            "_summary_path": summary_path
        })

    def sort_key(r):
        return (r.get("end_time") or r.get("start_time") or "")

    rows.sort(key=sort_key, reverse=True)

    try:
        limit = int(limit)
    except Exception:
        limit = 20
    limit = max(1, min(200, limit))
    return rows[:limit]


def get_session_detail(session_id: str):
    if not session_id:
        return None
    sdir = os.path.join(SESS_DIR, f"session_{session_id}")
    summary_path = os.path.join(sdir, "summary.json")
    summary = _read_json(summary_path)
    if isinstance(summary, dict):
        return summary
    for r in list_session_summaries(limit=200):
        if r.get("session_id") == session_id:
            summary = _read_json(r.get("_summary_path"))
            if isinstance(summary, dict):
                return summary
    return None


def read_session_raw_points(session_id: str, limit: int = 2000, stride: int = 5):
    sdir = os.path.join(SESS_DIR, f"session_{session_id}")
    raw_path = os.path.join(sdir, "raw.jsonl")
    if not os.path.exists(raw_path):
        return None

    points = []
    try:
        limit = int(limit)
    except Exception:
        limit = 2000
    limit = max(100, min(20000, limit))

    try:
        stride = int(stride)
    except Exception:
        stride = 5
    stride = max(1, min(100, stride))

    i = 0
    with open(raw_path, "r", encoding="utf-8") as f:
        for line in f:
            i += 1
            if stride > 1 and (i % stride != 0):
                continue
            try:
                msg = json.loads(line.strip())
            except Exception:
                continue

            t = msg.get("t")
            gf = msg.get("gyro_filt")
            st = msg.get("state")
            reps = msg.get("reps")
            rec = msg.get("recording")

            if t is None or gf is None:
                continue

            points.append({
                "t": float(t),
                "gyro_filt": float(gf),
                "state": st,
                "reps": int(reps) if reps is not None else None,
                "recording": bool(rec) if rec is not None else None,
                # NEW fields
                "velocity": msg.get("velocity"),
                "displacement": msg.get("displacement"),
                "roll": msg.get("roll"),
                "pitch": msg.get("pitch"),
            })

            if len(points) >= limit:
                break

    return points


# =============================================================================
# Export Helper
# =============================================================================

def export_session_zip(session_id: str, device_info: dict, thresholds: dict):
    if not session_id:
        return None, None

    sdir = os.path.join(SESS_DIR, f"session_{session_id}")
    summary_path = os.path.join(sdir, "summary.json")
    raw_path = os.path.join(sdir, "raw.jsonl")

    if not (os.path.exists(summary_path) and os.path.exists(raw_path)):
        return None, None

    filename = f"export_{session_id}.zip"
    zip_path = os.path.join(EXPORT_DIR, filename)

    meta = {
        "session_id": session_id,
        "device_info": json_safe(device_info or {}),
        "thresholds": json_safe(thresholds or {}),
        "created_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    }

    tmp = zip_path + ".tmp"
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.write(summary_path, arcname="summary.json")
        z.write(raw_path, arcname="raw.jsonl")
        z.writestr("meta.json", json.dumps(meta, indent=2))

    os.replace(tmp, zip_path)
    return zip_path, filename


# =============================================================================
# Session Class (Extended with ML metrics)
# =============================================================================

class Session:
    def __init__(self):
        self.active = False
        self.session_id = None
        self.session_dir = None
        self.raw_path = None
        self.summary_path = None
        self.f = None
        self.start_ts = None
        self.end_ts = None
        self.reps = 0

        # Existing metrics
        self.moving_time = 0.0
        self.rep_times = []
        self.rep_breakdown = []
        self._last_motion_t = None
        self._last_rep_event_t = None

        # Per-rep fatigue proxies (gyro-based)
        self.peak_gyro_per_rep = []
        self._current_rep_peak = 0.0
        self.speed_proxy_per_rep = []
        self._current_rep_speed_peak = 0.0
        self._current_rep_speed_sum = 0.0
        self._current_rep_speed_n = 0

        # NEW: ML Pipeline metrics
        self.velocity_per_rep = []  # Peak velocity per rep (m/s)
        self.rom_per_rep = []       # ROM per rep (meters)

    def start(self):
        sid = make_session_id()
        sdir = os.path.join(SESS_DIR, f"session_{sid}")
        os.makedirs(sdir, exist_ok=True)

        self.session_id = sid
        self.session_dir = sdir
        self.raw_path = os.path.join(sdir, "raw.jsonl")
        self.summary_path = os.path.join(sdir, "summary.json")

        self.f = open(self.raw_path, "w", buffering=1, encoding="utf-8")
        self.start_ts = time.time()
        self.end_ts = None
        self.reps = 0
        self.active = True

        self._reset_metrics()

    def _reset_metrics(self):
        self.moving_time = 0.0
        self.rep_times = []
        self.rep_breakdown = []
        self._last_motion_t = None
        self._last_rep_event_t = None

        self.peak_gyro_per_rep = []
        self._current_rep_peak = 0.0
        self.speed_proxy_per_rep = []
        self._current_rep_speed_peak = 0.0
        self._current_rep_speed_sum = 0.0
        self._current_rep_speed_n = 0

        # NEW
        self.velocity_per_rep = []
        self.rom_per_rep = []

    def stop(self):
        self.end_ts = time.time()
        if self.f:
            try:
                self.f.close()
            except Exception:
                pass
        self.f = None
        self.active = False
        self._last_motion_t = None

    def log(self, msg: dict):
        if self.active and self.f:
            try:
                self.f.write(json.dumps(msg) + "\n")
            except Exception:
                pass

    def update_tut(self, mapped_state: str, t: float):
        if not self.active:
            self._last_motion_t = None
            return
        if mapped_state == STATE_MOVING:
            if self._last_motion_t is None:
                self._last_motion_t = t
            else:
                dt = t - self._last_motion_t
                if 0 <= dt <= 0.5:
                    self.moving_time += dt
                self._last_motion_t = t
        else:
            self._last_motion_t = None

    def update_peak(self, live_filt_abs: float):
        if not self.active:
            return
        if live_filt_abs > self._current_rep_peak:
            self._current_rep_peak = live_filt_abs

    def update_speed_proxy(self, live_filt_abs: float):
        if not self.active:
            return
        if live_filt_abs > self._current_rep_speed_peak:
            self._current_rep_speed_peak = live_filt_abs
        self._current_rep_speed_sum += live_filt_abs
        self._current_rep_speed_n += 1

    def finalize_rep_peak(self):
        peak = float(round(self._current_rep_peak, 2))
        self.peak_gyro_per_rep.append(peak)
        self._current_rep_peak = 0.0
        return peak

    def finalize_speed_proxy(self):
        peak = float(round(self._current_rep_speed_peak, 2))
        self.speed_proxy_per_rep.append(peak)
        self._current_rep_speed_peak = 0.0
        self._current_rep_speed_sum = 0.0
        self._current_rep_speed_n = 0
        return peak

    def on_rep_event(self, rep_index: int, t: float):
        tempo = None
        if self._last_rep_event_t is not None:
            dt = t - self._last_rep_event_t
            if 0.0 < dt < 20.0:
                tempo = float(round(dt, 3))
                self.rep_times.append(dt)
        self._last_rep_event_t = t
        return tempo

    # NEW: Store ML-based metrics
    def store_velocity_metric(self, peak_velocity: float):
        self.velocity_per_rep.append(peak_velocity)

    def store_rom_metric(self, rom: float):
        self.rom_per_rep.append(rom)

    def compute_avg_tempo(self):
        if not self.rep_times:
            return None
        return sum(self.rep_times) / len(self.rep_times)

    def compute_avg_peak_speed_proxy(self):
        if not self.speed_proxy_per_rep:
            return None
        return sum(self.speed_proxy_per_rep) / len(self.speed_proxy_per_rep)

    def compute_avg_velocity(self):
        if not self.velocity_per_rep:
            return None
        return sum(self.velocity_per_rep) / len(self.velocity_per_rep)

    def compute_avg_rom(self):
        if not self.rom_per_rep:
            return None
        return sum(self.rom_per_rep) / len(self.rom_per_rep)

    def write_summary(self, device_info: dict, thresholds: dict):
        if not self.session_dir:
            return None
        start_ts = self.start_ts or time.time()
        end_ts = self.end_ts or time.time()
        duration_sec = float(max(0.0, end_ts - start_ts))

        avg_tempo = self.compute_avg_tempo()
        output_loss = compute_loss_pct(self.peak_gyro_per_rep)
        avg_peak_speed = self.compute_avg_peak_speed_proxy()
        speed_loss = compute_loss_pct(self.speed_proxy_per_rep)

        # NEW metrics
        avg_velocity = self.compute_avg_velocity()
        velocity_loss = compute_loss_pct(self.velocity_per_rep)
        avg_rom = self.compute_avg_rom()
        rom_loss = compute_loss_pct(self.rom_per_rep)

        summary = {
            "version": 9,  # Bumped version for new fields
            "session_id": self.session_id,
            "start_time": iso_from_ts(start_ts),
            "end_time": iso_from_ts(end_ts),
            "duration_sec": round(duration_sec, 3),

            "total_reps": int(self.reps),

            "tut_sec": round(float(self.moving_time), 3),
            "avg_tempo_sec": None if avg_tempo is None else round(float(avg_tempo), 3),
            "rep_times_sec": [round(float(x), 3) for x in self.rep_times],
            "rep_breakdown": self.rep_breakdown,

            # Gyro-based metrics (legacy)
            "peak_gyro_per_rep": [round(float(x), 2) for x in self.peak_gyro_per_rep],
            "output_loss_pct": output_loss,
            "speed_proxy_per_rep": [round(float(x), 2) for x in self.speed_proxy_per_rep],
            "avg_peak_speed_proxy": None if avg_peak_speed is None else round(float(avg_peak_speed), 2),
            "speed_loss_pct": speed_loss,

            # NEW: ML Pipeline metrics
            "velocity_per_rep_ms": [round(float(x), 3) for x in self.velocity_per_rep],
            "avg_velocity_ms": None if avg_velocity is None else round(float(avg_velocity), 3),
            "velocity_loss_pct": velocity_loss,

            "rom_per_rep_m": [round(float(x), 3) for x in self.rom_per_rep],
            "avg_rom_m": None if avg_rom is None else round(float(avg_rom), 3),
            "rom_loss_pct": rom_loss,

            "device_info": json_safe(device_info or {}),
            "thresholds": json_safe(thresholds or {}),
        }

        tmp = self.summary_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
        os.replace(tmp, self.summary_path)
        return self.summary_path


session = Session()


# =============================================================================
# WebSocket Broadcast
# =============================================================================

async def broadcast(msg: dict):
    if not clients:
        return
    data = json.dumps(msg)
    dead = []
    for ws in list(clients):
        try:
            await ws.send(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        clients.discard(ws)


# =============================================================================
# Client Handler (unchanged structure, new fields in responses)
# =============================================================================

async def handle_client(ws):
    global RESET_REQUESTED, LAST_DETECTED_LIFT, LAST_LIFT_CONFIDENCE
    clients.add(ws)
    print("Client connected")

    try:
        await ws.send(json.dumps(LAST_STATUS))

        async for raw in ws:
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            if not isinstance(msg, dict) or not is_command_message(msg):
                continue

            action = msg.get("action")

            if action == "start":
                if not session.active:
                    session.start()
                    await ws.send(json.dumps({
                        "type": "ack", "action": "start", "ok": True,
                        "session_id": session.session_id,
                        "dir": session.session_dir,
                        "file": session.raw_path
                    }))
                else:
                    await ws.send(json.dumps({
                        "type": "ack", "action": "start", "ok": True,
                        "note": "already_active",
                        "session_id": session.session_id
                    }))

            elif action == "stop":
                if session.active:
                    session.stop()
                    summary_path = session.write_summary(SERVER_DEVICE_INFO, SERVER_THRESHOLDS)

                    avg_tempo = session.compute_avg_tempo()
                    avg_peak_speed = session.compute_avg_peak_speed_proxy()
                    avg_velocity = session.compute_avg_velocity()
                    avg_rom = session.compute_avg_rom()

                    await ws.send(json.dumps({
                        "type": "ack", "action": "stop", "ok": True,
                        "session_id": session.session_id,
                        "reps": int(session.reps),
                        "summary": summary_path
                    }))

                    await ws.send(json.dumps({
                        "type": "session_summary",
                        "session_id": session.session_id,
                        "total_reps": int(session.reps),

                        "tut_sec": round(float(session.moving_time), 3),
                        "avg_tempo_sec": None if avg_tempo is None else round(float(avg_tempo), 3),
                        "rep_times_sec": [round(float(x), 3) for x in session.rep_times],
                        "rep_breakdown": session.rep_breakdown,

                        "output_loss_pct": compute_loss_pct(session.peak_gyro_per_rep),
                        "speed_proxy_per_rep": [round(float(x), 2) for x in session.speed_proxy_per_rep],
                        "avg_peak_speed_proxy": None if avg_peak_speed is None else round(float(avg_peak_speed), 2),
                        "speed_loss_pct": compute_loss_pct(session.speed_proxy_per_rep),

                        # NEW
                        "avg_velocity_ms": None if avg_velocity is None else round(float(avg_velocity), 3),
                        "velocity_loss_pct": compute_loss_pct(session.velocity_per_rep),
                        "avg_rom_m": None if avg_rom is None else round(float(avg_rom), 3),
                        "rom_loss_pct": compute_loss_pct(session.rom_per_rep),
                        "detected_lift": LAST_DETECTED_LIFT,
                        "lift_confidence": round(float(LAST_LIFT_CONFIDENCE), 3),

                        "summary_path": summary_path
                    }))
                else:
                    await ws.send(json.dumps({
                        "type": "ack", "action": "stop", "ok": True,
                        "note": "already_inactive",
                        "reps": int(session.reps)
                    }))

            elif action == "reset":
                RESET_REQUESTED = True
                await ws.send(json.dumps({"type": "ack", "action": "reset", "ok": True}))

            elif action == "list_sessions":
                limit = msg.get("limit", 20)
                rows = list_session_summaries(limit)
                sessions_out = []
                for r in rows:
                    sessions_out.append({
                        "session_id": r.get("session_id"),
                        "start_time": r.get("start_time"),
                        "end_time": r.get("end_time"),
                        "duration_sec": r.get("duration_sec"),
                        "total_reps": r.get("total_reps"),
                        "tut_sec": r.get("tut_sec"),
                        "avg_tempo_sec": r.get("avg_tempo_sec"),
                        "output_loss_pct": r.get("output_loss_pct"),
                        "avg_peak_speed_proxy": r.get("avg_peak_speed_proxy"),
                        "speed_loss_pct": r.get("speed_loss_pct"),
                        # NEW
                        "avg_velocity_ms": r.get("avg_velocity_ms"),
                        "velocity_loss_pct": r.get("velocity_loss_pct"),
                        "avg_rom_m": r.get("avg_rom_m"),
                        "rom_loss_pct": r.get("rom_loss_pct"),
                    })
                await ws.send(json.dumps({
                    "type": "sessions_list",
                    "count": len(sessions_out),
                    "sessions": sessions_out
                }))

            elif action == "get_session":
                sid = msg.get("session_id")
                detail = get_session_detail(sid)
                if detail is None:
                    await ws.send(json.dumps({
                        "type": "session_detail",
                        "ok": False,
                        "error": "not_found",
                        "session_id": sid
                    }))
                else:
                    await ws.send(json.dumps({
                        "type": "session_detail",
                        "ok": True,
                        "session_id": sid,
                        "summary": detail
                    }))

            elif action == "get_session_raw":
                sid = msg.get("session_id")
                limit = msg.get("limit", 2000)
                stride = msg.get("stride", 5)
                pts = read_session_raw_points(sid, limit=limit, stride=stride)
                if pts is None:
                    await ws.send(json.dumps({
                        "type": "session_raw",
                        "ok": False,
                        "error": "not_found",
                        "session_id": sid
                    }))
                else:
                    await ws.send(json.dumps({
                        "type": "session_raw",
                        "ok": True,
                        "session_id": sid,
                        "count": len(pts),
                        "stride": int(stride),
                        "points": pts
                    }))

            elif action == "export_session":
                sid = msg.get("session_id")
                start_http = bool(msg.get("start_http", True))
                http_port = int(msg.get("http_port", 8000))

                zip_path, filename = export_session_zip(
                    sid,
                    device_info=SERVER_DEVICE_INFO,
                    thresholds=SERVER_THRESHOLDS
                )

                if zip_path is None:
                    await ws.send(json.dumps({
                        "type": "export_result",
                        "ok": False,
                        "error": "not_found",
                        "session_id": sid
                    }))
                else:
                    served_port = None
                    if start_http:
                        served_port = _start_export_http_server(http_port)

                    await ws.send(json.dumps({
                        "type": "export_result",
                        "ok": True,
                        "session_id": sid,
                        "zip_path": zip_path,
                        "filename": filename,
                        "http_port": served_port
                    }))

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        clients.discard(ws)
        print("Client disconnected")


# =============================================================================
# IMU Loop (Extended with ML Pipeline)
# =============================================================================

async def imu_loop():
    global LAST_STATUS, RESET_REQUESTED, SERVER_DEVICE_INFO, SERVER_THRESHOLDS
    global LAST_DETECTED_LIFT, LAST_LIFT_CONFIDENCE

    # Rep detection thresholds
    THRESHOLD = 1200.0
    MIN_REP_TIME = 0.6
    ALPHA = 0.2

    SERVER_THRESHOLDS = {
        "threshold": THRESHOLD,
        "min_rep_time_sec": MIN_REP_TIME,
        "alpha": ALPHA,
        "sample_rate_hz": SAMPLE_RATE_HZ,
    }

    # Initialize IMU
    imu = IMU()
    while True:
        try:
            imu.init()
            break
        except OSError as e:
            await broadcast({"type": "error", "where": "imu_init", "error": str(e)})
            try:
                imu.close()
            except Exception:
                pass
            await asyncio.sleep(0.5)
            imu = IMU()

    # Device info
    imu_addr = safe_getattr(imu, "addr", None) or safe_getattr(imu, "address", None)
    i2c_bus = safe_getattr(imu, "i2c_bus", None) or safe_getattr(imu, "bus_num", None)
    sample_rate_hz = safe_getattr(imu, "sample_rate_hz", None) or SAMPLE_RATE_HZ

    try:
        imu_addr_int = int(imu_addr) if imu_addr is not None else 0
        imu_addr_str = f"0x{imu_addr_int:02X}" if imu_addr is not None else "unknown"
    except Exception:
        imu_addr_str = str(imu_addr) if imu_addr is not None else "unknown"

    lift_classifier = LiftClassifierTFLite(enabled=ENABLE_TFLITE_INFERENCE)

    SERVER_DEVICE_INFO = json_safe({
        "pi_model": read_pi_model(),
        "imu": safe_getattr(imu, "name", None) or "IMU",
        "i2c_bus": i2c_bus if i2c_bus is not None else 1,
        "imu_addr": imu_addr_str,
        "sample_rate_hz": int(sample_rate_hz),
        "ml_pipeline_version": "1.0.0",
        "tflite_lift_inference_requested": bool(ENABLE_TFLITE_INFERENCE),
        "tflite_lift_inference_enabled": bool(lift_classifier.enabled),
        "tflite_lift_model_path": lift_classifier.model_path,
        "tflite_lift_metadata_path": lift_classifier.metadata_path,
        "tflite_lift_reason": lift_classifier.reason,
    })

    # Rep counters
    live_counter = RepCounter(threshold=THRESHOLD, min_rep_time=MIN_REP_TIME, alpha=ALPHA)
    session_counter = RepCounter(threshold=THRESHOLD, min_rep_time=MIN_REP_TIME, alpha=ALPHA)

    # NEW: ML Pipeline components
    orientation = OrientationFilter(sample_rate_hz=SAMPLE_RATE_HZ, beta=0.1)
    gravity_remover = GravityRemover()
    velocity_estimator = VelocityEstimator(sample_rate_hz=SAMPLE_RATE_HZ)
    rom_estimator = ROMEstimator(sample_rate_hz=SAMPLE_RATE_HZ)

    calib_secs = 2.0
    calib_start = time.time()

    t0 = time.time()
    last_send = 0.0
    was_recording = False
    last_session_reps = 0
    detected_lift_label = None
    detected_lift_conf = 0.0

    consecutive_failures = 0
    last_error_sent = 0.0

    try:
        while True:
            t = time.time() - t0

            # Handle reset request
            if RESET_REQUESTED:
                live_counter = RepCounter(threshold=THRESHOLD, min_rep_time=MIN_REP_TIME, alpha=ALPHA)
                session_counter = RepCounter(threshold=THRESHOLD, min_rep_time=MIN_REP_TIME, alpha=ALPHA)

                session.reps = 0
                session._reset_metrics()
                last_session_reps = 0

                # Reset ML pipeline
                orientation.reset()
                velocity_estimator.reset()
                rom_estimator.reset()
                lift_classifier.reset_stream()
                lift_classifier.start_session()
                detected_lift_label = None
                detected_lift_conf = 0.0
                LAST_DETECTED_LIFT = None
                LAST_LIFT_CONFIDENCE = 0.0

                RESET_REQUESTED = False

            # Read IMU
            try:
                ax, ay, az, gx, gy, gz = imu.read_accel_gyro()
                consecutive_failures = 0
            except OSError as e:
                consecutive_failures += 1
                now = time.time()
                if now - last_error_sent > 1.0:
                    last_error_sent = now
                    await broadcast({
                        "type": "error",
                        "where": "imu_read",
                        "error": str(e),
                        "consecutive_failures": consecutive_failures
                    })
                await asyncio.sleep(0.05)

                if consecutive_failures >= 10:
                    try:
                        imu.init()
                        consecutive_failures = 0
                        await broadcast({"type": "status", "note": "imu_reinitialized"})
                    except Exception:
                        await asyncio.sleep(0.25)
                continue

            # =========================================================
            # ML PIPELINE PROCESSING
            # =========================================================

            # 1. Get orientation (roll, pitch, yaw)
            roll, pitch, yaw = orientation.update(ax, ay, az, gx, gy, gz)

            # 2. Remove gravity to get linear acceleration
            a_lin_x, a_lin_y, a_lin_z = gravity_remover.remove_gravity(
                ax, ay, az, roll, pitch, yaw
            )

            # 3. Rep detection (using existing gyro-based method)
            _lr, live_filt, live_state = live_counter.update(gx, gy, gz, t)
            mapped = STATE_MOVING if live_state == "MOVING" else STATE_WAITING
            ui_state = STATE_CALIBRATING if (time.time() - calib_start < calib_secs) else mapped

            infer_out = lift_classifier.push_sample(ax, ay, az, gx, gy, gz)
            if infer_out is not None:
                detected_lift_label = infer_out["label"]
                detected_lift_conf = infer_out["confidence"]
                LAST_DETECTED_LIFT = detected_lift_label
                LAST_LIFT_CONFIDENCE = float(detected_lift_conf)

            # 4. Determine if bar is stable (for ZUPT)
            is_stable = (ui_state == STATE_WAITING)

            # 5. Estimate velocity (with ZUPT when stable)
            velocity = velocity_estimator.update(a_lin_z, is_stable=is_stable, timestamp=t)

            # 6. Update ROM
            displacement = rom_estimator.update(velocity, timestamp=t)

            # =========================================================
            # EXISTING METRIC TRACKING
            # =========================================================

            live_abs = abs(float(live_filt))
            session.update_tut(mapped, t)
            session.update_peak(live_abs)
            session.update_speed_proxy(live_abs)

            # Handle recording state transitions
            if session.active and not was_recording:
                session_counter = RepCounter(threshold=THRESHOLD, min_rep_time=MIN_REP_TIME, alpha=ALPHA)
                session._reset_metrics()
                last_session_reps = 0

                # Reset ML pipeline for new session
                velocity_estimator.reset()
                rom_estimator.reset()
                lift_classifier.start_session()
                detected_lift_label = None
                detected_lift_conf = 0.0
                LAST_DETECTED_LIFT = None
                LAST_LIFT_CONFIDENCE = 0.0

            was_recording = session.active

            # Rep detection and metrics during recording
            if session.active:
                reps, _sf, _ss = session_counter.update(gx, gy, gz, t)

                if reps > last_session_reps:
                    # Rep completed!

                    # Gyro-based metrics
                    tempo = session.on_rep_event(int(reps), t)
                    peak_gyro = session.finalize_rep_peak()
                    peak_speed_proxy = session.finalize_speed_proxy()

                    # ML-based metrics
                    velocity_metrics = velocity_estimator.on_rep_complete()
                    rep_rom = rom_estimator.on_rep_complete()

                    session.store_velocity_metric(velocity_metrics['peak_velocity'])
                    session.store_rom_metric(rep_rom)

                    # Start tracking next rep
                    velocity_estimator.on_rep_start()
                    rom_estimator.on_rep_start()

                    confidence = min(1.0, max(0.0, live_abs / 2000.0))

                    rep_event = {
                        "type": "rep_event",
                        "rep": int(reps),
                        "t": round(t, 3),
                        "confidence": round(confidence, 2),

                        # Gyro-based
                        "tempo_sec": tempo,
                        "peak_gyro": peak_gyro,
                        "peak_speed_proxy": peak_speed_proxy,

                        # ML-based
                        "peak_velocity_ms": round(velocity_metrics['peak_velocity'], 3),
                        "mean_concentric_velocity_ms": round(velocity_metrics['mean_concentric_velocity'], 3),
                        "rom_m": round(rep_rom, 3),
                        "rom_cm": round(rep_rom * 100, 1),
                    }
                    await broadcast(rep_event)
                    session.log(rep_event)

                    # Store in breakdown
                    bd = {
                        "rep": int(reps),
                        "t": round(t, 3),
                        "tempo_sec": tempo,
                        "peak_speed_proxy": peak_speed_proxy,
                        "peak_gyro": peak_gyro,
                        "confidence": round(confidence, 2),
                        # ML metrics
                        "peak_velocity_ms": round(velocity_metrics['peak_velocity'], 3),
                        "rom_m": round(rep_rom, 3),
                    }
                    session.rep_breakdown.append(bd)

                session.reps = int(reps)
                last_session_reps = int(reps)

            # Broadcast status update at 10 Hz
            if t - last_send >= 0.1:
                avg_tempo = session.compute_avg_tempo()
                avg_peak_speed = session.compute_avg_peak_speed_proxy()
                avg_velocity = session.compute_avg_velocity()
                avg_rom = session.compute_avg_rom()

                payload = {
                    "type": "rep_update",
                    "t": round(t, 3),
                    "reps": int(session.reps),
                    "state": ui_state,
                    "recording": bool(session.active),
                    "gyro_filt": round(float(live_filt), 1),

                    # Existing metrics
                    "tut_sec": round(float(session.moving_time), 2),
                    "avg_tempo_sec": None if avg_tempo is None else round(float(avg_tempo), 2),
                    "output_loss_pct": compute_loss_pct(session.peak_gyro_per_rep),
                    "avg_peak_speed_proxy": None if avg_peak_speed is None else round(float(avg_peak_speed), 2),
                    "speed_loss_pct": compute_loss_pct(session.speed_proxy_per_rep),

                    # NEW: ML Pipeline metrics
                    "velocity": round(velocity, 3),
                    "displacement": round(displacement, 4),
                    "roll": round(roll, 1),
                    "pitch": round(pitch, 1),
                    "yaw": round(yaw, 1),

                    "avg_velocity_ms": None if avg_velocity is None else round(float(avg_velocity), 3),
                    "velocity_loss_pct": compute_loss_pct(session.velocity_per_rep),
                    "avg_rom_m": None if avg_rom is None else round(float(avg_rom), 3),
                    "rom_loss_pct": compute_loss_pct(session.rom_per_rep),
                    "detected_lift": detected_lift_label,
                    "lift_confidence": round(float(detected_lift_conf), 3),
                }

                LAST_STATUS = dict(payload)
                LAST_STATUS["type"] = "status"

                await broadcast(payload)
                session.log(payload)
                last_send = t

            await asyncio.sleep(0.02)  # 50 Hz

    finally:
        try:
            imu.close()
        except Exception:
            pass


# =============================================================================
# Main
# =============================================================================

async def main():
    print(f"LiftIQ Server v9 (with ML Pipeline)")
    print(f"WebSocket: ws://{HOST}:{PORT}")
    print(f"Sample rate: {SAMPLE_RATE_HZ} Hz")
    print(f"TFLite lift inference requested: {ENABLE_TFLITE_INFERENCE}")
    
    server = await websockets.serve(
        handle_client, HOST, PORT,
        ping_interval=20,
        ping_timeout=20
    )
    await imu_loop()
    server.close()
    await server.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())
