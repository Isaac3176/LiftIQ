# LiftIQ

**Your barbell, smarter.**

A smart weightlifting system that combines a Raspberry Pi + IMU hardware stack with a React Native app for real-time tracking, rep detection, and session analytics.

![Version](https://img.shields.io/badge/version-MVP-blue)
![Platform](https://img.shields.io/badge/platform-React%20Native%20%7C%20Raspberry%20Pi-2ea44f)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

> Note: Raspberry Pi + Android is the primary tested setup today. iOS/web support depends on your local Expo environment and network setup.

<p align="center">
  <img src="src/images/raspberry_pi.png" alt="Raspberry Pi setup" width="420"/>
</p>

## Why LiftIQ?

- Local-first by default: sensor processing and workout flow run on your own hardware.
- Real hardware signal pipeline: not just app simulation.
- BYOH (Bring Your Own Hardware): Raspberry Pi + IMU + phone.
- Lightweight workflow: connect, start session, lift, review summary.
- Built for expansion: velocity metrics, ROM, ML classification, and form analysis.

## Features

- Real-time IMU capture from barbell-mounted 9-DoF sensor
- Live WebSocket streaming from Raspberry Pi to mobile app
- Session start/stop controls
- Real-time rep counting pipeline
- Workout summary metrics and export support
- ML scripts for preprocessing, classifier training, and TFLite export

## Hardware

<p align="center">
  <img src="src/images/icm20948.webp" alt="ICM-20948 IMU" width="320"/>
</p>

### Current setup

- Raspberry Pi (sensor polling + network transport)
- SparkFun ICM-20948 IMU (accelerometer, gyroscope, magnetometer)
- Power bank for portable runs
- Barbell mount (MVP-grade mounting)

### Placement notes

- Mount IMU rigidly on the barbell shaft.
- Keep the Raspberry Pi off-bar to reduce vibration and improve reliability.

## Project Structure

- `src/` React Native (Expo) mobile app
- `raspi_files/` Raspberry Pi sensor + WebSocket server code
- `ml/` data preprocessing, training, evaluation, and model export scripts

## Quick Start

### Mobile app

```bash
npm install
npm run start
```

### Raspberry Pi server

```bash
cd raspi_files
python ws_server.py
```

Default endpoint:

- `ws://<pi-ip>:8765`

## ML Workflow

From repo root:

```bash
python ml/scripts/preprocess_recgym.py
python ml/scripts/train_classifier.py
python ml/scripts/export_tflite.py
```

Generated artifacts are stored in:

- `ml/models/`
- `ml/reports/`

## Roadmap

- Improve rep detection robustness across lift types
- Add stronger velocity and ROM metrics
- Expand exercise classification quality and confidence handling
- Improve session trends and long-term analytics UI
- Evaluate BLE transport as an alternative to Wi-Fi

## Status

LiftIQ is actively evolving from an MVP into a more complete training assistant, with priority on correctness, reliability, and real-world usability before feature expansion.
