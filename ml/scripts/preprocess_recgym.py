"""
Preprocess Kaggle Gym Workout IMU Dataset for lift classification.

Dataset: Kaggle Gym Workout IMU Dataset
Sensor: Apple Watch SE (left wrist), 100 Hz
File format: ddmmyy_CODE_Wxx_Sx_Rxx.csv

Usage:
    python preprocess_recgym.py
"""

import os
import json
import argparse
import numpy as np
import pandas as pd
from pathlib import Path
from collections import defaultdict

# =============================================================================
# Configuration
# =============================================================================

SAMPLE_RATE_HZ = 100
TRIM_START_SEC = 1.5
TRIM_END_SEC = 1.5
WINDOW_SEC = 2.5
STRIDE_SEC = 0.5

TRIM_START_SAMPLES = int(TRIM_START_SEC * SAMPLE_RATE_HZ)  # 150
TRIM_END_SAMPLES = int(TRIM_END_SEC * SAMPLE_RATE_HZ)      # 150
WINDOW_SAMPLES = int(WINDOW_SEC * SAMPLE_RATE_HZ)          # 250
STRIDE_SAMPLES = int(STRIDE_SEC * SAMPLE_RATE_HZ)          # 50

MIN_SAMPLES_AFTER_TRIM = WINDOW_SAMPLES
MIN_WINDOWS_PER_CLASS = 3

# =============================================================================
# Column Mappings - UPDATED FOR YOUR DATASET
# =============================================================================

# Your CSV columns:
# - wristMotion_accelerationX/Y/Z (accelerometer)
# - wristMotion_rotationRateX/Y/Z (gyroscope)
# - wristMotion_gravityX/Y/Z (gravity vector)
# - activity (label)

ACCEL_X_COL = 'wristMotion_accelerationX'
ACCEL_Y_COL = 'wristMotion_accelerationY'
ACCEL_Z_COL = 'wristMotion_accelerationZ'
GYRO_X_COL = 'wristMotion_rotationRateX'
GYRO_Y_COL = 'wristMotion_rotationRateY'
GYRO_Z_COL = 'wristMotion_rotationRateZ'
LABEL_COL = 'activity'

# Feature columns in order
FEATURE_COLS = [ACCEL_X_COL, ACCEL_Y_COL, ACCEL_Z_COL, GYRO_X_COL, GYRO_Y_COL, GYRO_Z_COL]

# =============================================================================
# Exercise Code Mapping
# =============================================================================

EXERCISE_CODES = {
    'SBLP': 'Straight Bar Lat Pulldown',
    'CGCR': 'Close Grip Cable Row',
    'NGCR': 'Neutral Grip Cable Row',
    'SAP': 'Single Arm Pulldown',
    'MGTBR': 'Mid Grip T Bar Rows',
    'AIDBC': 'Alternating Incline Dumbbell Bicep Curl',
    'MPBC': 'Machine Preacher Bicep Curl',
    'SHC': 'Seated Hamstring Curl',
    'SMS': 'Smith Machine Squat',
    'LE': 'Leg Extension',
    '30DBP': '30 Incline Dumbbell Bench Press',
    'DSP': '75 deg Dumbbell Shoulder Press',
    'DLR': 'Dumbbell Lateral Raise',
    'SACLR': 'Single Arm Cable Lateral Raise',
    'MRF': 'Machine Rear Fly',
    'FAPU': 'Face Pulls',
    'SBCTP': 'Straight Bar Cable Tricep Pushdown',
    'MSP': 'Machine Shoulder Press',
    'SECR': 'Standing Calf Raise',
    'PUSH': 'Pushups',
    'PULL': 'Pullups',
    'MTE': 'Machine Tricep Extension',
    'SHSS': 'Slow Half Smith Squats',
    'STCR': 'Seated Calf Raise',
    'ILE': 'Isometric Leg Extension',
    'CRDP': 'Cable Rear Delt Pull',
    'MIBP': 'Machine Incline Bench Press',
    'APULL': 'Assisted Pullup',
    'PREC': 'Preacher Curls',
    'SSLHS': 'Slow Single Leg Half Squat',
    'HT': 'Hip Thrust',
    'SAOCTE': 'Single Arm Overhead Cable Tricep Ext',
    '45DBP': '45 Incline Dumbbell Bench Press',
    'SAODTE': 'Single Arm Overhead Dumbbell Tricep Ext',
    'LHC': 'Lying Hamstring Curl',
    'IDBC': 'Incline Dumbbell Bicep Curl',
    'DWC': 'Dumbbell Wrist Curl',
    'CGOCTE': 'Close Grip Overhead Cable Tricep Ext',
    '30BP': '30deg Incline Bench Press',
}


# =============================================================================
# Helper Functions
# =============================================================================

def load_csv_file(filepath: str) -> tuple:
    """Load a single CSV file and extract features + label."""
    try:
        df = pd.read_csv(filepath)
    except Exception as e:
        print(f"  Error reading {Path(filepath).name}: {e}")
        return None, None, None
    
    if len(df) == 0:
        print(f"  Empty file: {Path(filepath).name}")
        return None, None, None
    
    # Check for required columns
    missing = [c for c in FEATURE_COLS if c not in df.columns]
    if missing:
        print(f"  Missing columns in {Path(filepath).name}: {missing}")
        return None, None, None
    
    # Get label from 'activity' column
    label = None
    if LABEL_COL in df.columns:
        labels = df[LABEL_COL].dropna().unique()
        if len(labels) >= 1:
            label = str(labels[0]).strip()
    
    if label is None:
        print(f"  No label in {Path(filepath).name}")
        return None, None, None
    
    # Extract features: [ax, ay, az, gx, gy, gz]
    data = df[FEATURE_COLS].values.astype(np.float32)
    
    # Handle NaN/Inf
    if np.any(~np.isfinite(data)):
        data = np.nan_to_num(data, nan=0.0, posinf=0.0, neginf=0.0)
    
    info = {
        'filename': Path(filepath).name,
        'original_samples': len(data),
        'label': label,
    }
    
    return data, label, info


def trim_recording(data: np.ndarray) -> np.ndarray:
    """Remove first and last 1.5 seconds (sensor lag/noise)."""
    total_trim = TRIM_START_SAMPLES + TRIM_END_SAMPLES
    if len(data) <= total_trim + MIN_SAMPLES_AFTER_TRIM:
        return None
    
    if TRIM_END_SAMPLES > 0:
        return data[TRIM_START_SAMPLES:-TRIM_END_SAMPLES]
    else:
        return data[TRIM_START_SAMPLES:]


def extract_windows(data: np.ndarray) -> np.ndarray:
    """Extract sliding windows from a recording."""
    windows = []
    for start in range(0, len(data) - WINDOW_SAMPLES + 1, STRIDE_SAMPLES):
        windows.append(data[start:start + WINDOW_SAMPLES])
    
    if not windows:
        return np.array([]).reshape(0, WINDOW_SAMPLES, 6)
    return np.array(windows)


def compute_normalization_stats(windows: np.ndarray) -> tuple:
    """Compute per-channel mean and std from training windows."""
    flat = windows.reshape(-1, windows.shape[-1])
    mean = flat.mean(axis=0)
    std = np.maximum(flat.std(axis=0), 1e-8)
    return mean.astype(np.float32), std.astype(np.float32)


def normalize_windows(windows: np.ndarray, mean: np.ndarray, std: np.ndarray) -> np.ndarray:
    """Apply z-score normalization per channel."""
    return ((windows - mean) / std).astype(np.float32)


# =============================================================================
# Main Processing Pipeline
# =============================================================================

def process_dataset(input_dir: str, output_dir: str, test_size: float = 0.2, val_size: float = 0.1):
    """Process entire dataset."""
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Find CSV files
    csv_files = list(input_path.glob('**/*.csv'))
    print(f"Found {len(csv_files)} CSV files in {input_dir}")
    
    if len(csv_files) == 0:
        print(f"\nNo CSV files found!")
        return
    
    # Show sample files
    print("\nSample files:")
    for f in csv_files[:3]:
        print(f"  {f.name}")
    
    # Process files
    all_windows = []
    all_labels = []
    all_file_indices = []
    file_infos = []
    label_counts = defaultdict(int)
    skipped = []
    
    print(f"\nProcessing {len(csv_files)} files...")
    print("(Trimming first/last 1.5s, extracting 2.5s windows with 0.5s stride)")
    
    for i, csv_file in enumerate(csv_files):
        if (i + 1) % 30 == 0 or (i + 1) == len(csv_files):
            print(f"  {i + 1}/{len(csv_files)}...")
        
        data, label, info = load_csv_file(str(csv_file))
        if data is None:
            skipped.append(f"{csv_file.name} (load failed)")
            continue
        
        trimmed = trim_recording(data)
        if trimmed is None or len(trimmed) < WINDOW_SAMPLES:
            skipped.append(f"{csv_file.name} (too short: {len(data)} samples)")
            continue
        
        windows = extract_windows(trimmed)
        if len(windows) == 0:
            skipped.append(f"{csv_file.name} (no windows)")
            continue
        
        file_idx = len(file_infos)
        for w in windows:
            all_windows.append(w)
            all_labels.append(label)
            all_file_indices.append(file_idx)
            label_counts[label] += 1
        
        info['num_windows'] = len(windows)
        file_infos.append(info)
    
    print(f"\nProcessed: {len(file_infos)} valid files")
    print(f"Skipped: {len(skipped)} files")
    print(f"Total windows: {len(all_windows)}")
    
    if len(all_windows) == 0:
        print("\nNo windows extracted! Check data format.")
        if skipped[:5]:
            print("\nFirst 5 skipped files:")
            for s in skipped[:5]:
                print(f"  {s}")
        return
    
    X = np.array(all_windows)
    file_indices = np.array(all_file_indices)
    
    # Print label distribution
    print("\n" + "="*60)
    print("EXERCISE DISTRIBUTION")
    print("="*60)
    print(f"{'Code':<12} {'Full Name':<40} {'Windows':>8}")
    print("-"*60)
    for label, count in sorted(label_counts.items(), key=lambda x: -x[1]):
        full_name = EXERCISE_CODES.get(label, 'Unknown')[:39]
        print(f"{label:<12} {full_name:<40} {count:>8}")
    print("-"*60)
    print(f"{'TOTAL':<12} {'':<40} {sum(label_counts.values()):>8}")
    
    # Filter rare classes
    valid_labels = {l for l, c in label_counts.items() if c >= MIN_WINDOWS_PER_CLASS}
    removed = set(label_counts.keys()) - valid_labels
    
    if removed:
        print(f"\nRemoving rare classes (< {MIN_WINDOWS_PER_CLASS} windows):")
        for label in removed:
            print(f"  {label}: {label_counts[label]} windows")
    
    # Create label mapping
    sorted_labels = sorted(valid_labels)
    label_to_idx = {l: i for i, l in enumerate(sorted_labels)}
    idx_to_label = {i: l for l, i in label_to_idx.items()}
    
    # Filter data
    valid_mask = np.array([l in valid_labels for l in all_labels])
    X = X[valid_mask]
    file_indices = file_indices[valid_mask]
    filtered_labels = [l for l, v in zip(all_labels, valid_mask) if v]
    y = np.array([label_to_idx[l] for l in filtered_labels])
    
    print(f"\nAfter filtering: {len(X)} windows, {len(sorted_labels)} classes")
    
    # Split by file (not by window) to prevent data leakage
    from sklearn.model_selection import train_test_split
    
    unique_files = np.unique(file_indices)
    print(f"\nSplitting {len(unique_files)} recordings into train/val/test...")
    
    train_files, temp_files = train_test_split(
        unique_files, 
        test_size=test_size + val_size, 
        random_state=42
    )
    
    if len(temp_files) > 1:
        val_files, test_files = train_test_split(
            temp_files, 
            test_size=test_size / (test_size + val_size), 
            random_state=42
        )
    else:
        val_files = temp_files[:1]
        test_files = temp_files[1:] if len(temp_files) > 1 else temp_files
    
    train_mask = np.isin(file_indices, train_files)
    val_mask = np.isin(file_indices, val_files)
    test_mask = np.isin(file_indices, test_files)
    
    X_train, y_train = X[train_mask], y[train_mask]
    X_val, y_val = X[val_mask], y[val_mask]
    X_test, y_test = X[test_mask], y[test_mask]
    
    print(f"  Train: {len(X_train):>5} windows from {len(train_files)} recordings")
    print(f"  Val:   {len(X_val):>5} windows from {len(val_files)} recordings")
    print(f"  Test:  {len(X_test):>5} windows from {len(test_files)} recordings")
    
    # Compute normalization stats from training data only
    norm_mean, norm_std = compute_normalization_stats(X_train)
    print(f"\nNormalization (from training data):")
    print(f"  Mean: [{', '.join(f'{v:.3f}' for v in norm_mean)}]")
    print(f"  Std:  [{', '.join(f'{v:.3f}' for v in norm_std)}]")
    
    # Normalize
    X_train = normalize_windows(X_train, norm_mean, norm_std)
    X_val = normalize_windows(X_val, norm_mean, norm_std)
    X_test = normalize_windows(X_test, norm_mean, norm_std)
    
    # Save
    print(f"\nSaving to {output_path}...")
    
    np.savez_compressed(
        output_path / 'windows.npz',
        X_train=X_train, y_train=y_train,
        X_val=X_val, y_val=y_val,
        X_test=X_test, y_test=y_test,
        norm_mean=norm_mean, norm_std=norm_std
    )
    
    # Save metadata
    metadata = {
        'dataset': 'Kaggle Gym Workout IMU Dataset',
        'sensor': 'Apple Watch SE (left wrist)',
        'sample_rate_hz': SAMPLE_RATE_HZ,
        'window_sec': WINDOW_SEC,
        'window_samples': WINDOW_SAMPLES,
        'stride_sec': STRIDE_SEC,
        'stride_samples': STRIDE_SAMPLES,
        'trim_start_sec': TRIM_START_SEC,
        'trim_end_sec': TRIM_END_SEC,
        'num_classes': len(sorted_labels),
        'labels': sorted_labels,
        'label_to_idx': label_to_idx,
        'idx_to_label': {str(k): v for k, v in idx_to_label.items()},
        'label_names': {l: EXERCISE_CODES.get(l, l) for l in sorted_labels},
        'feature_cols': ['ax', 'ay', 'az', 'gx', 'gy', 'gz'],
        'original_feature_cols': FEATURE_COLS,
        'num_features': 6,
        'train_samples': int(len(X_train)),
        'val_samples': int(len(X_val)),
        'test_samples': int(len(X_test)),
        'train_recordings': int(len(train_files)),
        'val_recordings': int(len(val_files)),
        'test_recordings': int(len(test_files)),
        'norm_mean': norm_mean.tolist(),
        'norm_std': norm_std.tolist(),
        'label_distribution': {
            'train': {idx_to_label[i]: int((y_train == i).sum()) for i in range(len(sorted_labels))},
            'val': {idx_to_label[i]: int((y_val == i).sum()) for i in range(len(sorted_labels))},
            'test': {idx_to_label[i]: int((y_test == i).sum()) for i in range(len(sorted_labels))},
        },
    }
    
    with open(output_path / 'metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)
    
    file_size = os.path.getsize(output_path / 'windows.npz') / 1024 / 1024
    print(f"\nSaved:")
    print(f"  - windows.npz ({file_size:.1f} MB)")
    print(f"  - metadata.json")
    
    # Final summary
    print("\n" + "="*60)
    print("PREPROCESSING COMPLETE")
    print("="*60)
    print(f"Classes: {len(sorted_labels)}")
    print(f"Total windows: {len(X_train) + len(X_val) + len(X_test)}")
    print(f"Input shape: ({WINDOW_SAMPLES}, 6)")
    print(f"\nNext step: python ml/scripts/train_classifier.py")


# =============================================================================
# Entry Point
# =============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Preprocess Gym IMU dataset")
    parser.add_argument('--input_dir', type=str, default='ml/data/recgym_raw')
    parser.add_argument('--output_dir', type=str, default='ml/data/recgym_processed')
    parser.add_argument('--test_size', type=float, default=0.2)
    parser.add_argument('--val_size', type=float, default=0.1)
    args = parser.parse_args()
    
    process_dataset(args.input_dir, args.output_dir, args.test_size, args.val_size)