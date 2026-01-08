import time
from imu_driver import IMU
from rep_counter import RepCounter

def main():
    imu = IMU()
    imu.init()

    counter = RepCounter(
        threshold=1200.0,   # we will tune this
        min_rep_time=0.6,
        alpha=0.2
    )

    print("\n--- REP COUNTER (BENCH MVP) ---")
    print("Move the IMU up/down. Ctrl+C to stop.\n")

    t0 = time.time()
    last_print = 0.0

    try:
        while True:
            t = time.time() - t0
            ax, ay, az, gx, gy, gz = imu.read_accel_gyro()

            reps, filt, state = counter.update(gx, gy, gz, t)

            if t - last_print > 0.2:  # print 5x/sec
                print(f"reps={reps:3d}  filt={filt:7.1f}  state={state}")
                last_print = t

            time.sleep(0.02)  # ~50Hz
    except KeyboardInterrupt:
        print("\n--- STOP ---")
        print("Total reps:", counter.reps)
    finally:
        imu.close()

if __name__ == "__main__":
    main()
