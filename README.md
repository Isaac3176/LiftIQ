# LiftIQ

LiftIQ is a smart weightlifting assistant that combines a Raspberry Pi + IMU sensor stack with a React Native app for real-time rep tracking and workout analytics.

## Project Status

This repository contains a working end-to-end MVP:

- Real IMU data capture on Raspberry Pi
- Live WebSocket streaming to mobile app
- Real-time rep counting during sessions
- Advanced session summary dashboard (velocity, fatigue, ROM, stability, tempo)
- Velocity-loss fatigue tracking with stop-set recommendations
- Calibration-based E1RM estimation (per exercise, persistent on device)
- Local session logging to JSON for future model training datasets
- Single-session and export-all JSON sharing
- ML training pipeline for lift classification (offline)

## Architecture

- `src/` React Native (Expo) mobile app
- `src/context/CalibrationContext.js` persistent calibration + E1RM utilities
- `src/utils/sessionStorage.js` local session save/load/export
- `raspi_files/` Raspberry Pi data capture + WebSocket server
- `ml/` dataset preprocessing, model training, and TFLite export

## Session Data & Export

Completed sessions are saved locally as JSON files in the app documents directory:

- `sessions/*.json` (managed by `src/utils/sessionStorage.js`)

Saved files include:

- exercise + load metadata
- full per-rep metrics (velocity, ROM, stability, tempo)
- session-level summaries (velocity loss, fatigue level)
- E1RM estimate + confidence (when calibrated)

You can export:

- a single session from Session Summary (`Save & Export`)
- all locally saved sessions from History (`Export All`)

## Prerequisites

- Node.js 18+ and npm
- Python 3.10+ (for Raspberry Pi scripts and ML scripts)
- Raspberry Pi with I2C enabled
- Supported IMU module (ICM-20948)

## Quick Start (Mobile App)

```bash
npm install
npm run start
```

Use Expo to run on Android, iOS, or web.

## Raspberry Pi Server

From `raspi_files/`:

```bash
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

Outputs are saved under:

- `ml/models/`
- `ml/reports/`

## Common Commands

```bash
npm run start
npm run android
npm run ios
npm run web
```

## Repository Hygiene

This repo includes:

- Issue templates for bug reports and feature requests
- Pull request template
- Contributing and security policy docs
- Code owners for review routing

## Contributing

See `CONTRIBUTING.md` for contribution workflow and expectations.

## Security

See `SECURITY.md` for reporting security issues.
