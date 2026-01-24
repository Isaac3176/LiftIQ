import asyncio, json, time, os, platform
import websockets
from datetime import datetime, timezone

from imu_driver import IMU
from rep_counter import RepCounter

HOST = "0.0.0.0"
PORT = 8765

# Sessions folder under this file
SESS_DIR = os.path.join(os.path.dirname(__file__), "sessions")
os.makedirs(SESS_DIR, exist_ok=True)

clients = set()

STATE_CALIBRATING = "CALIBRATING"
STATE_WAITING = "WAITING"
STATE_MOVING = "MOVING"

# Snapshot sent immediately on reconnect
LAST_STATUS = {
    "type": "status",
    "state": STATE_WAITING,
    "reps": 0,
    "recording": False,
    "t": 0.0,
    "gyro_filt": 0.0,
    "tut_sec": 0.0,
    "avg_tempo_sec": None
}

RESET_REQUESTED = False


# -----------------------------
# Helpers
# -----------------------------
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
    """Make anything JSON serializable (avoid SMBus / custom objects breaking json.dump)."""
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

def compute_output_loss_pct(peaks):
    """
    Simple fatigue proxy: compare last rep peak to first rep peak.
    output_loss = (1 - last/first) * 100
    """
    if not peaks or len(peaks) < 2:
        return None
    first = float(peaks[0])
    last = float(peaks[-1])
    if first <= 0:
        return None
    loss = (1.0 - (last / first)) * 100.0
    return round(clamp(loss, 0.0, 100.0), 2)

def is_command_message(msg: dict) -> bool:
    t = msg.get("type")
    return t in ("cmd", "command")

def _read_json(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


# -----------------------------
# History: list + get session
# -----------------------------
def list_session_summaries(limit: int = 20):
    """
    Reads sessions/session_<id>/summary.json
    Returns rows sorted most recent first.
    """
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
    """
    Returns full summary.json for session_id.
    """
    if not session_id:
        return None

    sdir = os.path.join(SESS_DIR, f"session_{session_id}")
    summary_path = os.path.join(sdir, "summary.json")
    summary = _read_json(summary_path)
    if isinstance(summary, dict):
        return summary

    # fallback search
    for r in list_session_summaries(limit=200):
        if r.get("session_id") == session_id:
            summary = _read_json(r.get("_summary_path"))
            if isinstance(summary, dict):
                return summary
    return None


# -----------------------------
# Playback: read downsampled raw.jsonl points
# -----------------------------
def _session_dir(session_id: str) -> str:
    return os.path.join(SESS_DIR, f"session_{session_id}")

def read_session_raw_points(session_id: str, limit: int = 2000, stride: int = 5):
    """
    Read raw.jsonl and return a downsampled list of points for playback/graphs.
    stride=5 means take every 5th sample.
    limit caps total points returned.
    """
    sdir = _session_dir(session_id)
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

            # Only include stream-like items
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
                "recording": bool(rec) if rec is not None else None
            })

            if len(points) >= limit:
                break

    return points


# -----------------------------
# Session manager (writes raw + summary)
# -----------------------------
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

        # Tempo + TUT
        self.moving_time = 0.0
        self.rep_times = []
        self.rep_breakdown = []
        self._last_motion_t = None
        self._last_rep_event_t = None

        # Peak gyro per rep (fatigue proxy)
        self.peak_gyro_per_rep = []
        self._current_rep_peak = 0.0

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

        # reset metrics
        self.moving_time = 0.0
        self.rep_times = []
        self.rep_breakdown = []
        self._last_motion_t = None
        self._last_rep_event_t = None

        self.peak_gyro_per_rep = []
        self._current_rep_peak = 0.0

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
        """Accumulate time in MOVING while recording."""
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
        """Track per-rep peak while recording."""
        if not self.active:
            return
        if live_filt_abs > self._current_rep_peak:
            self._current_rep_peak = live_filt_abs

    def finalize_rep_peak(self):
        peak = float(round(self._current_rep_peak, 2))
        self.peak_gyro_per_rep.append(peak)
        self._current_rep_peak = 0.0
        return peak

    def on_rep_event(self, rep_index: int, t: float):
        """Compute tempo from rep_event times."""
        if self._last_rep_event_t is not None:
            dt = t - self._last_rep_event_t
            if 0.0 < dt < 20.0:
                self.rep_times.append(dt)
                self.rep_breakdown.append({
                    "rep": int(rep_index),
                    "tempo_sec": float(round(dt, 3)),
                    "t": float(round(t, 3)),
                })
        self._last_rep_event_t = t

    def compute_avg_tempo(self):
        if not self.rep_times:
            return None
        return sum(self.rep_times) / len(self.rep_times)

    def write_summary(self, *, device_info: dict, thresholds: dict):
        if not self.session_dir:
            return None

        start_ts = self.start_ts or time.time()
        end_ts = self.end_ts or time.time()
        duration_sec = float(max(0.0, end_ts - start_ts))
        total_reps = int(self.reps)

        avg_tempo = self.compute_avg_tempo()
        output_loss = compute_output_loss_pct(self.peak_gyro_per_rep)

        summary = {
            "version": 6,
            "session_id": self.session_id,
            "start_time": iso_from_ts(start_ts),
            "end_time": iso_from_ts(end_ts),
            "duration_sec": round(duration_sec, 3),

            "total_reps": total_reps,

            "tut_sec": round(float(self.moving_time), 3),
            "avg_tempo_sec": None if avg_tempo is None else round(float(avg_tempo), 3),
            "rep_times_sec": [round(float(x), 3) for x in self.rep_times],
            "rep_breakdown": self.rep_breakdown,

            "peak_gyro_per_rep": [round(float(x), 2) for x in self.peak_gyro_per_rep],
            "output_loss_pct": output_loss,

            "device_info": json_safe(device_info or {}),
            "thresholds": json_safe(thresholds or {}),
        }

        tmp = self.summary_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
        os.replace(tmp, self.summary_path)
        return self.summary_path


session = Session()


async def broadcast(msg: dict):
    """Send msg to all clients; remove dead sockets."""
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


# -----------------------------
# Server-level device + thresholds
# -----------------------------
SERVER_DEVICE_INFO = {}
SERVER_THRESHOLDS = {}


# -----------------------------
# Client handler
# -----------------------------
async def handle_client(ws):
    global RESET_REQUESTED
    clients.add(ws)
    print("Client connected")

    try:
        # On connect, send current snapshot
        await ws.send(json.dumps(LAST_STATUS))

        async for raw in ws:
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            if not isinstance(msg, dict) or not is_command_message(msg):
                continue

            action = msg.get("action")

            # --- workout control ---
            if action == "start":
                if not session.active:
                    session.start()
                    await ws.send(json.dumps({
                        "type": "ack",
                        "action": "start",
                        "ok": True,
                        "session_id": session.session_id,
                        "dir": session.session_dir,
                        "file": session.raw_path
                    }))
                else:
                    await ws.send(json.dumps({
                        "type": "ack",
                        "action": "start",
                        "ok": True,
                        "note": "already_active",
                        "session_id": session.session_id
                    }))

            elif action == "stop":
                if session.active:
                    session.stop()
                    summary_path = session.write_summary(
                        device_info=SERVER_DEVICE_INFO,
                        thresholds=SERVER_THRESHOLDS
                    )

                    avg_tempo = session.compute_avg_tempo()
                    output_loss = compute_output_loss_pct(session.peak_gyro_per_rep)

                    # ack
                    await ws.send(json.dumps({
                        "type": "ack",
                        "action": "stop",
                        "ok": True,
                        "session_id": session.session_id,
                        "reps": int(session.reps),
                        "summary": summary_path
                    }))

                    # immediate summary message (UI can render without reading files)
                    await ws.send(json.dumps({
                        "type": "session_summary",
                        "session_id": session.session_id,
                        "total_reps": int(session.reps),
                        "tut_sec": round(float(session.moving_time), 3),
                        "avg_tempo_sec": None if avg_tempo is None else round(float(avg_tempo), 3),
                        "rep_times_sec": [round(float(x), 3) for x in session.rep_times],
                        "rep_breakdown": session.rep_breakdown,
                        "peak_gyro_per_rep": [round(float(x), 2) for x in session.peak_gyro_per_rep],
                        "output_loss_pct": output_loss,
                        "summary_path": summary_path
                    }))
                else:
                    await ws.send(json.dumps({
                        "type": "ack",
                        "action": "stop",
                        "ok": True,
                        "note": "already_inactive",
                        "reps": int(session.reps)
                    }))

            elif action == "reset":
                RESET_REQUESTED = True
                await ws.send(json.dumps({
                    "type": "ack",
                    "action": "reset",
                    "ok": True
                }))

            # --- history: list sessions ---
            elif action == "list_sessions":
                limit = msg.get("limit", 20)
                rows = list_session_summaries(limit)

                out = []
                for r in rows:
                    out.append({
                        "session_id": r.get("session_id"),
                        "start_time": r.get("start_time"),
                        "end_time": r.get("end_time"),
                        "duration_sec": r.get("duration_sec"),
                        "total_reps": r.get("total_reps"),
                        "tut_sec": r.get("tut_sec"),
                        "avg_tempo_sec": r.get("avg_tempo_sec"),
                        "output_loss_pct": r.get("output_loss_pct"),
                    })

                await ws.send(json.dumps({
                    "type": "sessions_list",
                    "count": len(out),
                    "sessions": out
                }))

            # --- history: get one session detail ---
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

            # --- playback: get downsampled raw points ---
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

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        clients.discard(ws)
        print("Client disconnected")


# -----------------------------
# IMU loop
# -----------------------------
async def imu_loop():
    global LAST_STATUS, RESET_REQUESTED, SERVER_DEVICE_INFO, SERVER_THRESHOLDS

    THRESHOLD = 1200.0
    MIN_REP_TIME = 0.6
    ALPHA = 0.2

    SERVER_THRESHOLDS = {
        "threshold": THRESHOLD,
        "min_rep_time_sec": MIN_REP_TIME,
        "alpha": ALPHA
    }

    imu = IMU()

    # Init loop (retry until sensor is ready)
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
    sample_rate_hz = safe_getattr(imu, "sample_rate_hz", None) or safe_getattr(imu, "rate_hz", None)

    try:
        imu_addr_int = int(imu_addr) if imu_addr is not None else 0
        imu_addr_str = f"0x{imu_addr_int:02X}" if imu_addr is not None else "unknown"
    except Exception:
        imu_addr_str = str(imu_addr) if imu_addr is not None else "unknown"

    SERVER_DEVICE_INFO = json_safe({
        "pi_model": read_pi_model(),
        "imu": safe_getattr(imu, "name", None) or "IMU",
        "i2c_bus": i2c_bus if i2c_bus is not None else 1,
        "imu_addr": imu_addr_str,
        "sample_rate_hz": int(sample_rate_hz) if isinstance(sample_rate_hz, (int, float)) else (sample_rate_hz or 50),
    })

    # Counters:
    live_counter = RepCounter(threshold=THRESHOLD, min_rep_time=MIN_REP_TIME, alpha=ALPHA)
    session_counter = RepCounter(threshold=THRESHOLD, min_rep_time=MIN_REP_TIME, alpha=ALPHA)

    calib_secs = 2.0
    calib_start = time.time()

    t0 = time.time()
    last_send = 0.0
    was_recording = False
    last_session_reps = 0

    consecutive_failures = 0
    last_error_sent = 0.0

    try:
        while True:
            t = time.time() - t0

            # reset request
            if RESET_REQUESTED:
                live_counter = RepCounter(threshold=THRESHOLD, min_rep_time=MIN_REP_TIME, alpha=ALPHA)
                session_counter = RepCounter(threshold=THRESHOLD, min_rep_time=MIN_REP_TIME, alpha=ALPHA)

                session.reps = 0
                session.moving_time = 0.0
                session.rep_times = []
                session.rep_breakdown = []
                session.peak_gyro_per_rep = []
                session._last_motion_t = None
                session._last_rep_event_t = None
                session._current_rep_peak = 0.0

                last_session_reps = 0
                RESET_REQUESTED = False

            # read sensor
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

            # live motion state + filter
            _lr, live_filt, live_state = live_counter.update(gx, gy, gz, t)
            mapped = STATE_MOVING if live_state == "MOVING" else STATE_WAITING
            ui_state = STATE_CALIBRATING if (time.time() - calib_start < calib_secs) else mapped

            # TUT + peaks accumulate only if recording
            session.update_tut(mapped, t)
            session.update_peak(abs(float(live_filt)))

            # transitions
            if session.active and not was_recording:
                print("Recording STARTED")
                session_counter = RepCounter(threshold=THRESHOLD, min_rep_time=MIN_REP_TIME, alpha=ALPHA)

                # reset session metrics at start
                session.reps = 0
                session.moving_time = 0.0
                session.rep_times = []
                session.rep_breakdown = []
                session.peak_gyro_per_rep = []
                session._last_motion_t = None
                session._last_rep_event_t = None
                session._current_rep_peak = 0.0
                last_session_reps = 0

            was_recording = session.active

            # count reps only when recording
            if session.active:
                reps, _sf, _ss = session_counter.update(gx, gy, gz, t)

                # rep_event when reps increments
                if reps > last_session_reps:
                    session.on_rep_event(int(reps), t)
                    peak = session.finalize_rep_peak()

                    # simple confidence proxy
                    confidence = min(1.0, max(0.0, abs(float(live_filt)) / 2000.0))

                    rep_event = {
                        "type": "rep_event",
                        "rep": int(reps),
                        "t": round(t, 3),
                        "confidence": round(confidence, 2),
                        "peak_gyro": peak
                    }
                    await broadcast(rep_event)
                    session.log(rep_event)

                session.reps = int(reps)
                last_session_reps = int(reps)

            # stream updates ~10Hz
            if t - last_send >= 0.1:
                avg_tempo = session.compute_avg_tempo()
                payload = {
                    "type": "rep_update",
                    "t": round(t, 3),
                    "reps": int(session.reps),
                    "state": ui_state,
                    "recording": bool(session.active),
                    "gyro_filt": round(float(live_filt), 1),

                    "tut_sec": round(float(session.moving_time), 2),
                    "avg_tempo_sec": None if avg_tempo is None else round(float(avg_tempo), 2),
                    "output_loss_pct": compute_output_loss_pct(session.peak_gyro_per_rep)
                }

                LAST_STATUS = {
                    "type": "status",
                    "state": ui_state,
                    "reps": int(session.reps),
                    "recording": bool(session.active),
                    "t": round(t, 3),
                    "gyro_filt": round(float(live_filt), 1),
                    "tut_sec": round(float(session.moving_time), 2),
                    "avg_tempo_sec": None if avg_tempo is None else round(float(avg_tempo), 2)
                }

                await broadcast(payload)
                session.log(payload)
                last_send = t

            await asyncio.sleep(0.02)

    finally:
        try:
            imu.close()
        except Exception:
            pass


# -----------------------------
# Main
# -----------------------------
async def main():
    print(f"WS server listening on ws://{HOST}:{PORT}")
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