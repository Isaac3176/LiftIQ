# LiftIQ Sensor Packet Schema

## Dataset: Kaggle Gym Workout IMU Dataset

| Property | Value |
|----------|-------|
| Sensor | Apple Watch SE |
| Location | Left wrist |
| Sample Rate | 100 Hz |
| Total Sets | 164 |
| Channels | 6 (accel xyz + gyro xyz) |

## Sensor Channels

| Index | Field | Units | Description |
|-------|-------|-------|-------------|
| 0 | ax | m/s² | Accelerometer X |
| 1 | ay | m/s² | Accelerometer Y |
| 2 | az | m/s² | Accelerometer Z |
| 3 | gx | rad/s | Gyroscope X |
| 4 | gy | rad/s | Gyroscope Y |
| 5 | gz | rad/s | Gyroscope Z |

## File Naming Convention

```
ddmmyy_CODE_Wxx_Sx_Rxx.csv
```

| Part | Description | Example |
|------|-------------|---------|
| ddmmyy | Date | 010123 |
| CODE | Exercise abbreviation | SMS |
| Wxx | Weight (kg) | W50 |
| Sx | Set number | S1 |
| Rxx | Rep count | R10 |

## Exercise Codes (39 exercises)

| Code | Exercise |
|------|----------|
| SBLP | Straight Bar Lat Pulldown |
| CGCR | Close Grip Cable Row |
| NGCR | Neutral Grip Cable Row |
| SAP | Single Arm Pulldown |
| MGTBR | Mid Grip T Bar Rows |
| AIDBC | Alternating Incline Dumbbell Bicep Curl |
| MPBC | Machine Preacher Bicep Curl |
| SHC | Seated Hamstring Curl |
| SMS | Smith Machine Squat |
| LE | Leg Extension |
| 30DBP | 30 Incline Dumbbell Bench Press |
| DSP | 75 deg Dumbbell Shoulder Press |
| DLR | Dumbbell Lateral Raise |
| SACLR | Single Arm Cable Lateral Raise |
| MRF | Machine Rear Fly |
| FAPU | Face Pulls |
| SBCTP | Straight Bar Cable Tricep Pushdown |
| MSP | Machine Shoulder Press |
| SECR | Standing Calf Raise |
| PUSH | Pushups |
| PULL | Pullups |
| MTE | Machine Tricep Extension |
| SHSS | Slow Half Smith Squats |
| STCR | Seated Calf Raise |
| ILE | Isometric Leg Extension |
| CRDP | Cable Rear Delt Pull |
| MIBP | Machine Incline Bench Press |
| APULL | Assisted Pullup |
| PREC | Preacher Curls |
| SSLHS | Slow Single Leg Half Squat |
| HT | Hip Thrust |
| SAOCTE | Single Arm Overhead Cable Tricep Ext |
| 45DBP | 45 Incline Dumbbell Bench Press |
| SAODTE | Single Arm Overhead Dumbbell Tricep Ext |
| LHC | Lying Hamstring Curl |
| IDBC | Incline Dumbbell Bicep Curl |
| DWC | Dumbbell Wrist Curl |
| CGOCTE | Close Grip Overhead Cable Tricep Ext |
| 30BP | 30deg Incline Bench Press |

## Preprocessing Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| Trim start | 1.5s (150 samples) | Remove sensor lag |
| Trim end | 1.5s (150 samples) | Remove noise |
| Window length | 2.5s (250 samples) | Captures 1-2 reps |
| Window stride | 0.5s (50 samples) | 80% overlap |
| Normalization | Z-score per channel | Training stats only |
| Min windows/class | 3 | Filter rare exercises |

## Model Input/Output

- **Input Shape**: `(batch, 250, 6)`
- **Output Shape**: `(batch, num_classes)`
- **Confidence Threshold**: 0.6 (below shows "Unknown")

## Label Columns in CSV

- `activity` - String abbreviation (e.g., "SMS", "SBLP")
- `activityEncoded` - Integer encoding