# LiftIQ — Smart Weightlifting Assistant (MVP)

<p align="center">
  <img src="src/images/raspberry_pi.png" alt="Raspberry Pi" width="420"/>
</p>

**LiftIQ** is a hardware–software system that tracks barbell movement in real time using a low-cost inertial measurement unit (IMU) and a mobile app. The project explores how embedded systems, wireless communication, and on-device analytics can be combined to deliver meaningful feedback during strength training.

This repository contains a **working MVP** focused on reliable data capture and real-time streaming from the barbell to a phone. Advanced features such as velocity analysis, ML-based rep detection, and form evaluation are planned next.

---

## What the MVP Does

The current MVP proves the **full end-to-end pipeline**:

- Reads real motion data from a **9-DoF IMU** mounted on a barbell  
- Streams IMU data wirelessly from a **Raspberry Pi** to a phone  
- Displays live sensor data in a **React Native** mobile app  
- Performs **basic real-time rep counting** using signal processing (no ML yet)  
- Supports **start / stop workout sessions**

> At this stage, the focus is **correctness, stability, and low latency**, not advanced modeling.

---

## Hardware Setup (Current)

<p align="center">
  <img src="src/images/icm20948.webp" alt="ICM-20948 IMU" width="360"/>
</p>

### Components
- **Raspberry Pi** — portable compute and networking  
- **SparkFun ICM-20948 9-DoF IMU**  
  - Accelerometer  
  - Gyroscope  
  - Magnetometer  
- **Power bank** for mobile use  
- **Barbell mount** (Velcro / zip-tie based for MVP)

### Placement
- The **IMU** is rigidly mounted on the barbell shaft to capture true bar motion  
- The **Raspberry Pi** is kept off the bar (pocket, belt pouch, or rack-mounted) to reduce vibration, noise, and risk  

---

## Software Architecture (MVP)


- The **Raspberry Pi** handles sensor polling and data streaming  
- The **mobile app** handles visualization and workout logic  
- All processing runs **locally** — no cloud dependency in the MVP  

---

## Tech Stack

### Embedded / Hardware
- Raspberry Pi OS  
- Python  
- I2C communication  
- SparkFun ICM-20948 driver  

### Mobile App
- React Native (Expo)  
- JavaScript  
- WebSockets  
- On-device processing only  

---

## Why This Project

Most student fitness projects are software-only. **LiftIQ is intentionally a systems project**, designed to deal with real-world constraints:

- Sensor noise and drift  
- Embedded data pipelines  
- Wireless communication latency  
- Mobile UX under real-time data load  

The long-term vision includes:
- Velocity-based training metrics  
- Automatic exercise classification  
- On-device ML for rep detection and form scoring  
- 3D visualization of bar path  

None of that matters unless the fundamentals work first — **this MVP is about getting those fundamentals right**.

---

## Current Status

- ✅ MVP complete and functional  
- ✅ Live IMU data streaming to phone  
- ✅ Basic rep counting implemented  
- 🔄 Actively iterating on stability and data quality  

---

## Planned Next Steps

- Replace heuristic rep counting with **ML-based detection**  
- Add **bar velocity** and range-of-motion estimation  
- Transition from Wi-Fi to **Bluetooth Low Energy (BLE)**  
- Add session summaries and performance trends  
- Explore **real-time form feedback**  

---

## Notes

This project is being developed incrementally, with an emphasis on **correctness, debuggability, and real-world constraints** rather than rushing features. Each phase builds directly on a working system.

---

*LiftIQ is an ongoing exploration of embedded sensing, mobile systems, and applied machine learning in a real training environment.*
