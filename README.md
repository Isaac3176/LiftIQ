# LiftIQ

LiftIQ is a smart weightlifting assistant that combines a Raspberry Pi + IMU sensor stack with a React Native app for real-time rep tracking and workout analytics.

## Project Status

This repository contains a working end-to-end MVP:

- Real IMU data capture on Raspberry Pi
- Live WebSocket streaming to mobile app
- Real-time rep counting during sessions
- Session summaries and export support
- ML training pipeline for lift classification (offline)

## Architecture

- `src/` React Native (Expo) mobile app
- `raspi_files/` Raspberry Pi data capture + WebSocket server
- `ml/` dataset preprocessing, model training, and TFLite export

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
