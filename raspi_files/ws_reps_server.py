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
        self.active = False

    def log(self, msg: dict):
        if self.active and self.f:
            self.f.write(json.dumps(msg) + "\n")

session = Session()

async def broadcast(msg: dict):
    if not clients:
        return
    data = json.dumps(msg)
    dead = []
    for ws in clients:
        try:
            await ws.send(data)
        except:
            dead.append(ws)
    for ws in dead:
        clients.discard(ws)

async def handle_client(ws):
    clients.add(ws)
    print("Client connected")
    try:
        # On connect, send current status
        await ws.send(json.dumps({
            "type": "status",
            "state": STATE_WAITING,
            "reps": session.reps
        }))

        async for raw in ws:
            # Handle commands from UI
            try:
                msg = json.loads(raw)
            except:
                continue

            if msg.get("type") == "cmd":
                action = msg.get("action")

                if action == "start":
                    if not session.active:
                        session.start()
                        await ws.send(json.dumps({"type": "ack", "action": "start", "ok": True, "file": session.filepath}))
                    else:
                        await ws.send(json.dumps({"type": "ack", "action": "start", "ok": True, "note": "already_active"}))

                elif action == "stop":
                    if session.active:
                        session.stop()
                    await ws.send(json.dumps({"type": "ack", "action": "stop", "ok": True, "reps": session.reps}))

                elif action == "reset":
                    # Reset rep counter state handled in loop; we just ack here
                    await ws.send(json.dumps({"type": "ack", "action": "reset", "ok": True}))

    finally:
        clients.discard(ws)
        print("Client disconnected")

async def imu_loop():
    imu = IMU()
    imu.init()

    # Rep counter (tune threshold later)
    counter = RepCounter(threshold=1200.0, min_rep_time=0.6, alpha=0.2)

    # Simple calibration window (2 seconds baseline)
    calib_secs = 2.0
    calib_start = time.time()
    state = STATE_CALIBRATING

    t0 = time.time()
    last_send = 0.0

    try:
        while True:
            t = time.time() - t0

            try:
                ax, ay, az, gx, gy, gz = imu.read_accel_gyro()
            except OSError as e:
                # I2C glitch recovery
                await broadcast({"type": "error", "where": "imu_read", "error": str(e)})
                await asyncio.sleep(0.2)
                try:
                    imu.init()
                except:
                    pass
                continue

            reps, filt, rep_state = counter.update(gx, gy, gz, t)
            session.reps = reps

            # Map rep counter state to UI state names
            mapped = STATE_MOVING if rep_state == "MOVING" else STATE_WAITING

            # Calibration state handling (for UI)
            if state == STATE_CALIBRATING:
                if time.time() - calib_start >= calib_secs:
                    state = mapped
                else:
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
                await broadcast(payload)
                session.log(payload)
                last_send = t

            await asyncio.sleep(0.02)

    finally:
        imu.close()

async def main():
    print(f"WS server listening on ws://{HOST}:{PORT}")
    server = await websockets.serve(handle_client, HOST, PORT)
    await imu_loop()
    server.close()
    await server.wait_closed()

if __name__ == "__main__":
    asyncio.run(main())
