# LiftIQ

### Your barbell, smarter.

A smart weightlifting assistant that turns raw IMU motion data into real-time training feedback on your phone.

![Version](https://img.shields.io/badge/version-MVP-blue)
![Platform](https://img.shields.io/badge/platform-Raspberry%20Pi%20%2B%20React%20Native-2ea44f)
![Status](https://img.shields.io/badge/status-active%20development-orange)

> Note: Raspberry Pi + Android is the primary tested setup today. iOS and web support depend on local Expo/network setup.

<p align="center">
  <img src="src/images/raspberry_pi.png" alt="Raspberry Pi setup" width="420"/>
</p>

## Why LiftIQ?

- Local-first: workout processing runs on your own hardware.
- Real sensor pipeline: captures real barbell motion, not simulated input.
- No subscription model: bring your own hardware and APIs.
- Lightweight workflow: connect, start session, lift, review.
- Built to scale: velocity, ROM, lift classification, and form analytics.

## Features

- Real-time IMU capture from a barbell-mounted 9-DoF sensor
- WebSocket streaming from Raspberry Pi to mobile app
- Start/stop workout sessions with live rep updates
- Rep counting and session-level workout summaries
- Export-ready data path for analysis and iteration
- Offline ML workflow for preprocessing, training, and TFLite export

## Hardware

<p align="center">
  <img src="src/images/icm20948.webp" alt="ICM-20948 IMU" width="320"/>
</p>

Current setup:

- Raspberry Pi (sensor polling and transport)
- SparkFun ICM-20948 IMU (accelerometer, gyroscope, magnetometer)
- Power bank for portability
- Barbell mount (MVP rig)

Placement guidance:

- Mount the IMU rigidly on the barbell shaft.
- Keep Raspberry Pi off-bar to reduce vibration noise.

## Architecture

- `src/` React Native (Expo) app UI and workout flow
- `raspi_files/` Raspberry Pi sensor + WebSocket server
- `ml/` preprocessing, model training, reports, and export scripts

## Quick Start

Mobile app:

```bash
npm install
npm run start
```

Pi server:

```bash
cd raspi_files
python ws_server.py
```

Default WebSocket endpoint:

- `ws://<pi-ip>:8765`

## ML Pipeline

From repo root:

```bash
python ml/scripts/preprocess_recgym.py
python ml/scripts/train_classifier.py
python ml/scripts/export_tflite.py
```

Outputs:

- `ml/models/`
- `ml/reports/`

## Roadmap

- Improve rep detection stability across more lift patterns
- Strengthen velocity and ROM metric accuracy
- Expand classifier quality and confidence handling
- Improve session trends and analytics UX
- Evaluate BLE as an alternative to Wi-Fi transport
