import asyncio, json, time, os
import websockets

from imu_driver import IMU
from rep_counter import RepCounter

HOST = "0.0.0.0"
PORT = 8765

# Session folder
SESS_DIR = os.path.join(os.path.dirname(__file__), "sessions")
os.makedirs(SESS_DIR, exist_ok=True)

clients = set()

# App states to match your UI
STATE_DISCONNECTED = "DISCONNECTED"
STATE_CALIBRATING = "CALIBRATING"
STATE_WAITING = "WAITING"
STATE_MOVING = "MOVING"
STATE_RECORDING = "RECORDING"
STATE_STOPPED = "STOPPED"

# Snapshot sent immediately on reconnect
LAST_STATUS = {
    "type": "status",
    "state": STATE_WAITING,
    "reps": 0,
    "recording": False,
    "t": 0.0,
    "gyro_filt": 0.0
}

# Cross-task flags
RESET_REQUESTED = False


class Session:
    def __init__(self):
        self.active = False
        self.filepath = None
        self.f = None
        self.t0 = None
        self.reps = 0

    def start(self):
        ts = time.strftime("%Y%m%d_%H%M%S")
        self.filepath = os.path.join(SESS_DIR, f"session_{ts}.jsonl")
        self.f = open(self.filepath, "w", buffering=1)
        self.t0 = time.time()
        self.reps = 0
        self.active = True

    def stop(self):
        if self.f:
            self.f.close()
        self.f = None
        self.active = False

    def log(self, msg: dict):
        if self.active and self.f:
            self.f.write(json.dumps(msg) + "\n")


session = Session()


async def broadcast(msg: dict):
    """Send a message to all connected clients; drop dead sockets."""
    if not clients:
        return
    data = json.dumps(msg)
    dead = []
    for ws in clients:
        try:
            await ws.send(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        clients.discard(ws)


async def handle_client(ws):
    """Handle a single UI client connection and incoming commands."""
    global RESET_REQUESTED

    clients.add(ws)
    print("Client connected")
    try:
        # Send latest snapshot immediately (reconnect/resume)
        await ws.send(json.dumps(LAST_STATUS))

        async for raw in ws:
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            if msg.get("type") != "cmd":
                continue

            action = msg.get("action")

            if action == "start":
                if not session.active:
                    session.start()
                    await ws.send(json.dumps({
                        "type": "ack",
                        "action": "start",
                        "ok": True,
                        "file": session.filepath
                    }))
                else:
                    await ws.send(json.dumps({
                        "type": "ack",
                        "action": "start",
                        "ok": True,
                        "note": "already_active"
                    }))

            elif action == "stop":
                if session.active:
                    session.stop()
                await ws.send(json.dumps({
                    "type": "ack",
                    "action": "stop",
                    "ok": True,
                    "reps": session.reps
                }))

            elif action == "reset":
                RESET_REQUESTED = True
                await ws.send(json.dumps({
                    "type": "ack",
                    "action": "reset",
                    "ok": True
                }))

    finally:
        clients.discard(ws)
        print("Client disconnected")


async def imu_loop():
    """Read IMU continuously, update rep count, broadcast to UI, and log sessions."""
    global LAST_STATUS, RESET_REQUESTED

    imu = IMU()
    imu.init()

    # Rep counter (tune threshold later)
    counter = RepCounter(threshold=1200.0, min_rep_time=0.6, alpha=0.2)

    # Simple calibration window (2 seconds)
    calib_secs = 2.0
    calib_start = time.time()
    state = STATE_CALIBRATING

    t0 = time.time()
    last_send = 0.0

    try:
        while True:
            t = time.time() - t0

            # Handle reset request
            if RESET_REQUESTED:
                counter = RepCounter(threshold=1200.0, min_rep_time=0.6, alpha=0.2)
                session.reps = 0
                session.reps = 0
                RESET_REQUESTED = False

            try:
                ax, ay, az, gx, gy, gz = imu.read_accel_gyro()
            except OSError as e:
                # I2C glitch recovery
                await broadcast({"type": "error", "where": "imu_read", "error": str(e)})
                await asyncio.sleep(0.2)
                try:
                    imu.init()
                except Exception:
                    pass
                continue

            reps, filt, rep_state = counter.update(gx, gy, gz, t)
            session.reps = reps

            # Map rep counter state to UI state names
            mapped = STATE_MOVING if rep_state == "MOVING" else STATE_WAITING

            # Calibration state handling
            if time.time() - calib_start < calib_secs:
                state = STATE_CALIBRATING
            else:
                state = mapped

            # Stream to UI ~10Hz
            if t - last_send >= 0.1:
                payload = {
                    "type": "rep_update",
                    "t": round(t, 3),
                    "reps": reps,
                    "state": state,
                    "gyro_filt": round(filt, 1)
                }

                # Update snapshot so reconnecting clients get the latest state instantly
                LAST_STATUS = {
                    "type": "status",
                    "state": state,
                    "reps": reps,
                    "recording": session.active,
                    "t": round(t, 3),
                    "gyro_filt": round(filt, 1)
                }

                await broadcast(payload)
                session.log(payload)
                last_send = t

            await asyncio.sleep(0.02)

    finally:
        imu.close()


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