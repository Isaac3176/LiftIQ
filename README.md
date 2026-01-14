LiftIQ — Smart Weightlifting Assistant (MVP)
LiftIQ is a hardware-software system that tracks barbell movement in real time using an inertial measurement unit (IMU) and a mobile app. The goal of the project is to explore how low-cost sensors, embedded systems, and on-device analytics can be combined to give meaningful feedback during strength training.
This repository currently contains a working MVP that focuses on reliable data capture and real-time streaming from the barbell to a phone. More advanced features (velocity analysis, ML-based rep detection, and form evaluation) are planned next.

What the MVP Does
The current MVP proves the full end-to-end pipeline:
Reads real motion data from a 9-DoF IMU mounted on a barbell
Streams IMU data wirelessly from a Raspberry Pi to a phone
Displays live sensor data in a React Native mobile app
Performs basic real-time rep counting using signal processing (no ML yet)
Supports start/stop workout sessions
The focus at this stage is correctness, stability, and latency, not advanced modeling.

Hardware Setup (Current)



4
Components
Raspberry Pi (portable compute + networking)
SparkFun ICM-20948 9-DoF IMU (accelerometer, gyroscope, magnetometer)
Power bank for mobile use
Barbell mount (Velcro / zip-tie based for MVP)
Placement
IMU is rigidly mounted on the barbell shaft to capture true bar motion
Raspberry Pi is off the bar (pocket, belt pouch, or rack-mounted) to reduce noise and risk

Software Architecture (MVP)
IMU (ICM-20948)
   → I2C
Raspberry Pi (Python)
   → WebSocket (Wi-Fi)
React Native Mobile App
   → Live visualization + rep counter

The Raspberry Pi handles sensor reading and data streaming
The mobile app handles visualization and workout logic
All processing runs locally (no cloud dependency for MVP)

Tech Stack
Embedded / Hardware
Raspberry Pi OS
Python
I2C communication
SparkFun ICM-20948 driver
Mobile App
React Native (Expo)
JavaScript
WebSockets
On-device processing only

Why This Project
Most student fitness projects are software-only. LiftIQ is intentionally built as a systems project:
Real sensor noise and drift
Embedded data pipelines
Wireless communication constraints
Mobile UX under real-time data load
The long-term goal is to build toward:
Velocity-based training metrics
Automatic exercise classification
On-device ML for rep detection and form scoring
3D visualization of bar path
But none of that matters unless the fundamentals work first — this MVP is about getting those fundamentals right.

Current Status
MVP complete and functional
Live IMU data streaming to phone
Basic rep counting implemented
Actively iterating on stability and data quality

Planned Next Steps
Replace heuristic rep counting with ML-based detection
Add bar velocity and range-of-motion estimation
Transition from Wi-Fi to Bluetooth Low Energy (BLE)
Add session summaries and performance trends
Explore real-time form feedback

Notes
This project is being developed incrementally, with an emphasis on correctness, debuggability, and real-world constraints rather than rushing features. Each phase builds directly on a working system.

