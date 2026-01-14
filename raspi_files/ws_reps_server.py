import asyncio, json, time, os, platform
import websockets
from datetime import datetime, timezone

from imu_driver import IMU
from rep_counter import RepCounter

HOST = "0.0.0.0"
PORT = 8765

SESS_DIR = os.path.join(os.path.dirname(__file__), "sessions")
os.makedirs(SESS_DIR, exist_ok=True)

clients = set()

STATE_CALIBRATING = "CALIBRATING"
STATE_WAITING = "WAITING"
STATE_MOVING = "MOVING"

LAST_STATUS = {
    "type": "status",
    "state": STATE_WAITING,
    "reps": 0,
    "recording": False,
    "t": 0.0,
    "gyro_filt": 0.0
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
    """
    Recursively convert any non-JSON-serializable objects (e.g., SMBus)
    into strings so json.dump never crashes.
    """
    if x is None:
        return None
    if isinstance(x, (str, int, float, bool)):
        return x
    if isinstance(x, (list, tuple)):
        return [json_safe(v) for v in x]
    if isinstance(x, dict):
        return {str(k): json_safe(v) for k, v in x.items()}
    return str(x)


# -----------------------------
# Session manager + tempo/TUT
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
        self.moving_time = 0.0          # seconds in MOVING while recording
        self.rep_times = []             # list of (sec) between reps
        self._last_motion_t = None      # last t used for TUT accumulation
        self._last_rep_event_t = None   # last rep_event t

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

        # Reset metrics
        self.moving_time = 0.0
        self.rep_times = []
        self._last_motion_t = None
        self._last_rep_event_t = None

    def stop(self):
        self.end_ts = time.time()
        if self.f:
            try:
                self.f.close()
            except Exception:
                pass
        self.f = None
        self.active = False

        # Close out motion timer
        self._last_motion_t = None

    def log(self, msg: dict):
        if self.active and self.f:
            try:
                self.f.write(json.dumps(msg) + "\n")
            except Exception:
                pass

    def update_tut(self, mapped_state: str, t: float):
        """
        Accumulate Time Under Tension (TUT) as total time in MOVING while recording.
        Call this every loop iteration.
        """
        if not self.active:
            self._last_motion_t = None
            return

        if mapped_state == STATE_MOVING:
            if self._last_motion_t is None:
                self._last_motion_t = t
            else:
                dt = t - self._last_motion_t
                if 0 <= dt <= 0.5:  # guard against big jumps
                    self.moving_time += dt
                self._last_motion_t = t
        else:
            self._last_motion_t = None

    def on_rep_event(self, t: float):
        """
        Add rep-to-rep tempo based on rep_event timestamp.
        """
        if self._last_rep_event_t is not None:
            dt = t - self._last_rep_event_t
            if 0.0 < dt < 20.0:
                self.rep_times.append(dt)
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
        duration_sec = max(0, float(end_ts - start_ts))
        total_reps = int(self.reps)

        avg_tempo = self.compute_avg_tempo()

        # IMPORTANT: sanitize to prevent SMBus crash
        device_info = json_safe(device_info or {})
        thresholds = json_safe(thresholds or {})

        summary = {
            "version": 2,
            "session_id": self.session_id,

            "start_time": iso_from_ts(start_ts),
            "end_time": iso_from_ts(end_ts),
            "duration_sec": float(round(duration_sec, 3)),
            "total_reps": total_reps,

            # New metrics
            "tut_sec": float(round(self.moving_time, 3)),
            "avg_tempo_sec": None if avg_tempo is None else float(round(avg_tempo, 3)),
            "rep_times_sec": [float(round(x, 3)) for x in self.rep_times],

            "device_info": device_info,
            "thresholds": thresholds,
        }

        tmp = self.summary_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
        os.replace(tmp, self.summary_path)

        return self.summary_path


session = Session()


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


def is_command_message(msg: dict) -> bool:
    t = msg.get("type")
    return t in ("cmd", "command")


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
        await ws.send(json.dumps(LAST_STATUS))

        async for raw in ws:
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            if not isinstance(msg, dict) or not is_command_message(msg):
                continue

            action = msg.get("action")
            print("CMD received:", action, "raw:", msg)

            if action == "start":
                if not session.active:
                    session.start()
                    await ws.send(json.dumps({
                        "type": "ack",
                        "action": "start",
                        "ok": True,
                        "note": "started",
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

                    # send both ack + summary
                    await ws.send(json.dumps({
                        "type": "ack",
                        "action": "stop",
                        "ok": True,
                        "reps": session.reps,
                        "session_id": session.session_id,
                        "summary": summary_path
                    }))

                    await ws.send(json.dumps({
                        "type": "session_summary",
                        "session_id": session.session_id,
                        "reps": session.reps,
                        "tut_sec": float(round(session.moving_time, 3)),
                        "avg_tempo_sec": session.compute_avg_tempo() if session.compute_avg_tempo() is None else float(round(session.compute_avg_tempo(), 3)),
                        "rep_times_sec": [float(round(x, 3)) for x in session.rep_times],
                        "summary": summary_path
                    }))

                else:
                    await ws.send(json.dumps({
                        "type": "ack",
                        "action": "stop",
                        "ok": True,
                        "note": "already_inactive",
                        "reps": session.reps
                    }))

            elif action == "reset":
                RESET_REQUESTED = True
                await ws.send(json.dumps({
                    "type": "ack",
                    "action": "reset",
                    "ok": True
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
        "alpha": ALPHA,
    }

    imu = IMU()

    # init loop
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

    # ----- Device info (must be JSON safe) -----
    imu_addr = safe_getattr(imu, "addr", None) or safe_getattr(imu, "address", None)
    i2c_bus = safe_getattr(imu, "i2c_bus", None) or safe_getattr(imu, "bus_num", None)

    bus_obj = safe_getattr(imu, "bus", None)
    if i2c_bus is None and bus_obj is not None:
        possible_num = safe_getattr(bus_obj, "bus", None) or safe_getattr(bus_obj, "fd", None)
        i2c_bus = possible_num if possible_num is not None else str(bus_obj)

    sample_rate_hz = safe_getattr(imu, "sample_rate_hz", None) or safe_getattr(imu, "rate_hz", None)

    try:
        imu_addr_int = int(imu_addr) if imu_addr is not None else 0
        imu_addr_str = f"0x{imu_addr_int:02X}" if imu_addr is not None else "unknown"
    except Exception:
        imu_addr_int = 0
        imu_addr_str = str(imu_addr) if imu_addr is not None else "unknown"

    SERVER_DEVICE_INFO = json_safe({
        "pi_model": read_pi_model(),
        "imu": safe_getattr(imu, "name", None) or "IMU",
        "i2c_bus": i2c_bus if i2c_bus is not None else 1,
        "imu_addr": imu_addr_str,
        "imu_addr_int": imu_addr_int,
        "sample_rate_hz": int(sample_rate_hz) if isinstance(sample_rate_hz, (int, float)) else (sample_rate_hz or 50),
    })

    # counters
    live_counter = RepCounter(threshold=THRESHOLD, min_rep_time=MIN_REP_TIME, alpha=ALPHA)
    session_counter = RepCounter(threshold=THRESHOLD, min_rep_time=MIN_REP_TIME, alpha=ALPHA)

    calib_secs = 2.0
    calib_start = time.time()

    t0 = time.time()
    last_send = 0.0
    was_recording = False

    # rep_event tracking
    last_session_reps = 0

    # error throttling
    consecutive_failures = 0
    last_error_sent = 0.0

    try:
        while True:
            t = time.time() - t0

            if RESET_REQUESTED:
                live_counter = RepCounter(threshold=THRESHOLD, min_rep_time=MIN_REP_TIME, alpha=ALPHA)
                session_counter = RepCounter(threshold=THRESHOLD, min_rep_time=MIN_REP_TIME, alpha=ALPHA)
                session.reps = 0
                session.moving_time = 0.0
                session.rep_times = []
                session._last_motion_t = None
                session._last_rep_event_t = None
                last_session_reps = 0
                RESET_REQUESTED = False

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
                        "consecutive_failures": consecutive_failures,
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

            # live state
            _lr, live_filt, live_state = live_counter.update(gx, gy, gz, t)
            mapped = STATE_MOVING if live_state == "MOVING" else STATE_WAITING

            # update TUT (uses mapped state, and only accumulates while session.active)
            session.update_tut(mapped, t)

            ui_state = STATE_CALIBRATING if (time.time() - calib_start < calib_secs) else mapped

            # start transition
            if session.active and not was_recording:
                print("Recording STARTED")
                session_counter = RepCounter(threshold=THRESHOLD, min_rep_time=MIN_REP_TIME, alpha=ALPHA)
                session.reps = 0
                session.moving_time = 0.0
                session.rep_times = []
                session._last_motion_t = None
                session._last_rep_event_t = None
                last_session_reps = 0

            # stop transition
            if (not session.active) and was_recording:
                print("Recording STOPPED")

            was_recording = session.active

            # count only if recording
            if session.active:
                reps, _sf, _ss = session_counter.update(gx, gy, gz, t)

                # new rep => rep_event + tempo tracking
                if reps > last_session_reps:
                    session.on_rep_event(t)

                    # simple confidence heuristic (placeholder)
                    confidence = min(1.0, max(0.0, abs(live_filt) / 2000.0))

                    rep_event = {
                        "type": "rep_event",
                        "rep": int(reps),
                        "t": round(t, 3),
                        "confidence": round(confidence, 2),
                    }
                    await broadcast(rep_event)
                    session.log(rep_event)

                session.reps = reps
                last_session_reps = reps

            # broadcast 10 Hz
            if t - last_send >= 0.1:
                payload = {
                    "type": "rep_update",
                    "t": round(t, 3),
                    "reps": int(session.reps),
                    "state": ui_state,
                    "recording": bool(session.active),
                    "gyro_filt": round(live_filt, 1),
                    # optional live metrics (nice for UI display)
                    "tut_sec": round(session.moving_time, 2),
                    "avg_tempo_sec": None if session.compute_avg_tempo() is None else round(session.compute_avg_tempo(), 2),
                }

                LAST_STATUS = {
                    "type": "status",
                    "state": ui_state,
                    "reps": int(session.reps),
                    "recording": bool(session.active),
                    "t": round(t, 3),
                    "gyro_filt": round(live_filt, 1),
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