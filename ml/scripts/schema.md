# LiftIQ Sensor Packet Schema

## Overview

This document defines the standardized sensor packet format for the LiftIQ weightlifting tracking system. All components in the ML pipeline should conform to this schema for interoperability.

## Sensor Packet Fields

| Field     | Type    | Units   | Range              | Description                              |
|-----------|---------|---------|--------------------|-----------------------------------------|
| timestamp | float   | seconds | >= 0               | Time since session start                 |
| ax        | float   | m/s²    | ±156.8 (±16g)      | Accelerometer X-axis                     |
| ay        | float   | m/s²    | ±156.8 (±16g)      | Accelerometer Y-axis                     |
| az        | float   | m/s²    | ±156.8 (±16g)      | Accelerometer Z-axis                     |
| gx        | float   | deg/s   | ±2000              | Gyroscope X-axis (roll rate)             |
| gy        | float   | deg/s   | ±2000              | Gyroscope Y-axis (pitch rate)            |
| gz        | float   | deg/s   | ±2000              | Gyroscope Z-axis (yaw rate)              |

## Derived Fields (from orientation fusion)

| Field     | Type    | Units   | Range              | Description                              |
|-----------|---------|---------|--------------------|-----------------------------------------|
| roll      | float   | degrees | -180 to +180       | Rotation about X-axis                    |
| pitch     | float   | degrees | -90 to +90         | Rotation about Y-axis                    |
| yaw       | float   | degrees | -180 to +180       | Rotation about Z-axis                    |
| a_lin_x   | float   | m/s²    | ±156.8             | Linear acceleration X (gravity removed)  |
| a_lin_y   | float   | m/s²    | ±156.8             | Linear acceleration Y (gravity removed)  |
| a_lin_z   | float   | m/s²    | ±156.8             | Linear acceleration Z (gravity removed)  |

## Velocity & Position Fields

| Field       | Type    | Units   | Description                              |
|-------------|---------|---------|------------------------------------------|
| velocity    | float   | m/s     | Estimated bar velocity (vertical)        |
| displacement| float   | meters  | Position relative to rep start           |
| rom         | float   | meters  | Range of motion for completed rep        |

## Units Convention

### Acceleration
- **Raw IMU**: Often in g-units (1g = 9.81 m/s²)
- **Pipeline Standard**: m/s² (SI units)
- **Conversion**: `accel_ms2 = accel_g * 9.81`

### Gyroscope
- **Raw IMU**: Often in deg/s
- **Pipeline Standard**: deg/s for storage, rad/s for calculations
- **Conversion**: `gyro_rads = gyro_degs * (π / 180)`

### Angles
- **Storage**: degrees
- **Calculations**: radians internally
- **Convention**: Right-hand rule, NED (North-East-Down) or sensor-frame

### Time
- **Units**: seconds (float)
- **Resolution**: millisecond precision minimum
- **Reference**: Session start = 0.0

## Sample Rate

- **Target Rate**: 50 Hz
- **Acceptable Range**: 20-100 Hz
- **Recommendation**: Resample to 50 Hz for consistency

## Coordinate System

### Sensor Mounting (Barbell)
When mounted on a barbell with the sensor flat on top:
- **X-axis**: Along the barbell (left-right)
- **Y-axis**: Perpendicular to barbell (forward-backward)  
- **Z-axis**: Vertical (up-down) - **primary axis for velocity**

### Gravity Vector
At rest with sensor flat:
- `ax ≈ 0 m/s²`
- `ay ≈ 0 m/s²`
- `az ≈ +9.81 m/s²` (or -9.81 depending on orientation)

## Example Packet (JSON)

```json
{
  "timestamp": 1.234,
  "ax": 0.15,
  "ay": -0.08,
  "az": 9.75,
  "gx": 2.3,
  "gy": -1.1,
  "gz": 0.5,
  "roll": 0.8,
  "pitch": -0.4,
  "yaw": 12.3,
  "a_lin_x": 0.12,
  "a_lin_y": -0.05,
  "a_lin_z": -0.06,
  "velocity": 0.45,
  "displacement": 0.12
}
```

## Data Quality Indicators

| Metric              | Good       | Acceptable  | Poor        |
|---------------------|------------|-------------|-------------|
| Sample rate jitter  | < 5%       | < 10%       | > 10%       |
| Orientation drift   | < 1°/min   | < 3°/min    | > 3°/min    |
| Velocity drift      | < 0.1 m/s  | < 0.3 m/s   | > 0.3 m/s   |
| ZUPT effectiveness  | Resets to 0| Within 0.05 | > 0.1 m/s   |

## Version History

| Version | Date       | Changes                                    |
|---------|------------|--------------------------------------------|
| 1.0     | 2025-01-31 | Initial schema definition                  |
