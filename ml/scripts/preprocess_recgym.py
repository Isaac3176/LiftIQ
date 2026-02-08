"""
Preprocess Kaggle Gym Workout IMU Dataset for lift classification.

Dataset: Kaggle Gym Workout IMU Dataset
Sensor: Apple Watch SE (left wrist), 100 Hz
File format: ddmmyy_CODE_Wxx_Sx_Rxx.csv

Usage:
    python preprocess_recgym.py
    python preprocess_recgym.py --input_dir ml/data/gym_imu_raw --output_dir ml/data/gym_imu_processed

Output:
    - windows.npz: Preprocessed windows for training
    - metadata.json: Dataset statistics and label mapping
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
MIN_WINDOWS_PER_CLASS = 5

# =============================================================================
# Column Name Mappings
# =============================================================================

ACCEL_X_NAMES = ['ax', 'acc_x', 'accel_x', 'accelerometerAccelerationX', 'Accel_X', 'accel_X']
ACCEL_Y_NAMES = ['ay', 'acc_y', 'accel_y', 'accelerometerAccelerationY', 'Accel_Y', 'accel_Y']
ACCEL_Z_NAMES = ['az', 'acc_z', 'accel_z', 'accelerometerAccelerationZ', 'Accel_Z', 'accel_Z']
GYRO_X_NAMES = ['gx', 'gyro_x', 'gyroRotationX', 'Gyro_X', 'gyro_X']
GYRO_Y_NAMES = ['gy', 'gyro_y', 'gyroRotationY', 'Gyro_Y', 'gyro_Y']
GYRO_Z_NAMES = ['gz', 'gyro_z', 'gyroRotationZ', 'Gyro_Z', 'gyro_Z']
LABEL_COL_NAMES = ['activity', 'label', 'exercise', 'Activity', 'Label', 'class']


def find_column(df, possible_names):
    """Find a column by checking multiple possible names."""
    for name in possible_names:
        if name in df.columns:
            return name
    return None


# =============================================================================
# Helper Functions
# =============================================================================

def parse_filename(filename: str) -> dict:
    """Parse exercise info from filename: ddmmyy_CODE_Wxx_Sx_Rxx.csv"""
    name = Path(filename).stem
    parts = name.split('_')
    
    info = {'filename': filename, 'date': None, 'exercise_code': None, 
            'weight': None, 'set_num': None, 'reps': None}
    
    if len(parts) >= 2:
        info['date'] = parts[0]
        info['exercise_code'] = parts[1]
    
    for part in parts[2:]:
        p = part.upper()
        if p.startswith('W') and p[1:].isdigit():
            info['weight'] = int(p[1:])
        elif p.startswith('S') and p[1:].isdigit():
            info['set_num'] = int(p[1:])
        elif p.startswith('R') and p[1:].isdigit():
            info['reps'] = int(p[1:])
    
    return info


def load_csv_file(filepath: str) -> tuple:
    """Load a single CSV file and extract features + label."""
    try:
        df = pd.read_csv(filepath)
    except Exception as e:
        return None, None, None
    
    if len(df) == 0:
        return None, None, None
    
    # Find feature columns
    ax_col = find_column(df, ACCEL_X_NAMES)
    ay_col = find_column(df, ACCEL_Y_NAMES)
    az_col = find_column(df, ACCEL_Z_NAMES)
    gx_col = find_column(df, GYRO_X_NAMES)
    gy_col = find_column(df, GYRO_Y_NAMES)
    gz_col = find_column(df, GYRO_Z_NAMES)
    
    if None in [ax_col, ay_col, az_col, gx_col, gy_col, gz_col]:
        print(f"  Missing columns in {Path(filepath).name}")
        print(f"  Available: {list(df.columns)}")
        return None, None, None
    
    # Get label
    label = None
    label_col = find_column(df, LABEL_COL_NAMES)
    if label_col:
        labels = df[label_col].dropna().unique()
        if len(labels) >= 1:
            label = str(labels[0]).strip()
    
    if label is None:
        info = parse_filename(filepath)
        label = info.get('exercise_code')
    
    if label is None:
        return None, None, None
    
    # Extract features
    data = df[[ax_col, ay_col, az_col, gx_col, gy_col, gz_col]].values.astype(np.float32)
    data = np.nan_to_num(data, nan=0.0, posinf=0.0, neginf=0.0)
    
    info = parse_filename(filepath)
    info['original_samples'] = len(data)
    info['label'] = label
    
    return data, label, info


def trim_recording(data: np.ndarray) -> np.ndarray:
    """Remove first and last 1.5 seconds."""
    if len(data) <= TRIM_START_SAMPLES + TRIM_END_SAMPLES + MIN_SAMPLES_AFTER_TRIM:
        return None
    return data[TRIM_START_SAMPLES:-TRIM_END_SAMPLES] if TRIM_END_SAMPLES > 0 else data[TRIM_START_SAMPLES:]


def extract_windows(data: np.ndarray) -> np.ndarray:
    """Extract sliding windows from a recording."""
    windows = []
    for start in range(0, len(data) - WINDOW_SAMPLES + 1, STRIDE_SAMPLES):
        windows.append(data[start:start + WINDOW_SAMPLES])
    return np.array(windows) if windows else np.array([]).reshape(0, WINDOW_SAMPLES, 6)


def compute_normalization_stats(windows: np.ndarray) -> tuple:
    """Compute per-channel mean and std."""
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
    """Process entire dataset: load, trim, window, normalize, split."""
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    csv_files = list(input_path.glob('**/*.csv'))
    print(f"Found {len(csv_files)} CSV files")
    
    if len(csv_files) == 0:
        print(f"\nNo CSV files found in {input_dir}")
        print("Run: python download_recgym.py")
        return
    
    # Process files
    all_windows, all_labels, all_file_indices = [], [], []
    file_infos = []
    label_counts = defaultdict(int)
    
    print("\nProcessing files...")
    for i, csv_file in enumerate(csv_files):
        if (i + 1) % 30 == 0:
            print(f"  {i + 1}/{len(csv_files)}...")
        
        data, label, info = load_csv_file(str(csv_file))
        if data is None:
            continue
        
        trimmed = trim_recording(data)
        if trimmed is None or len(trimmed) < WINDOW_SAMPLES:
            continue
        
        windows = extract_windows(trimmed)
        if len(windows) == 0:
            continue
        
        file_idx = len(file_infos)
        for w in windows:
            all_windows.append(w)
            all_labels.append(label)
            all_file_indices.append(file_idx)
            label_counts[label] += 1
        
        info['num_windows'] = len(windows)
        file_infos.append(info)
    
    print(f"\nProcessed {len(file_infos)} valid files, {len(all_windows)} windows")
    
    if len(all_windows) == 0:
        print("No windows extracted!")
        return
    
    X = np.array(all_windows)
    file_indices = np.array(all_file_indices)
    
    # Print distribution
    print("\nLabel distribution:")
    for label, count in sorted(label_counts.items(), key=lambda x: -x[1]):
        print(f"  {label}: {count}")
    
    # Filter rare classes
    valid_labels = {l for l, c in label_counts.items() if c >= MIN_WINDOWS_PER_CLASS}
    sorted_labels = sorted(valid_labels)
    label_to_idx = {l: i for i, l in enumerate(sorted_labels)}
    idx_to_label = {i: l for l, i in label_to_idx.items()}
    
    valid_mask = np.array([l in valid_labels for l in all_labels])
    X = X[valid_mask]
    file_indices = file_indices[valid_mask]
    y = np.array([label_to_idx[l] for l, v in zip(all_labels, valid_mask) if v])
    
    print(f"\nAfter filtering: {len(X)} windows, {len(sorted_labels)} classes")
    
    # Split by file
    from sklearn.model_selection import train_test_split
    unique_files = np.unique(file_indices)
    
    train_files, temp_files = train_test_split(unique_files, test_size=test_size + val_size, random_state=42)
    val_files, test_files = train_test_split(temp_files, test_size=test_size/(test_size+val_size), random_state=42)
    
    train_mask = np.isin(file_indices, train_files)
    val_mask = np.isin(file_indices, val_files)
    test_mask = np.isin(file_indices, test_files)
    
    X_train, y_train = X[train_mask], y[train_mask]
    X_val, y_val = X[val_mask], y[val_mask]
    X_test, y_test = X[test_mask], y[test_mask]
    
    print(f"\nSplit: Train={len(X_train)}, Val={len(X_val)}, Test={len(X_test)}")
    
    # Normalize
    norm_mean, norm_std = compute_normalization_stats(X_train)
    X_train = normalize_windows(X_train, norm_mean, norm_std)
    X_val = normalize_windows(X_val, norm_mean, norm_std)
    X_test = normalize_windows(X_test, norm_mean, norm_std)
    
    # Save
    np.savez_compressed(output_path / 'windows.npz',
        X_train=X_train, y_train=y_train,
        X_val=X_val, y_val=y_val,
        X_test=X_test, y_test=y_test,
        norm_mean=norm_mean, norm_std=norm_std)
    
    metadata = {
        'dataset': 'Kaggle Gym Workout IMU Dataset',
        'sample_rate_hz': SAMPLE_RATE_HZ,
        'window_sec': WINDOW_SEC,
        'window_samples': WINDOW_SAMPLES,
        'stride_sec': STRIDE_SEC,
        'num_classes': len(sorted_labels),
        'labels': sorted_labels,
        'label_to_idx': label_to_idx,
        'idx_to_label': {str(k): v for k, v in idx_to_label.items()},
        'norm_mean': norm_mean.tolist(),
        'norm_std': norm_std.tolist(),
        'train_samples': int(len(X_train)),
        'val_samples': int(len(X_val)),
        'test_samples': int(len(X_test)),
    }
    
    with open(output_path / 'metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"\nSaved to {output_path}")
    print("Next: python train_classifier.py")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--input_dir', default='ml/data/gym_imu_raw')
    parser.add_argument('--output_dir', default='ml/data/gym_imu_processed')
    args = parser.parse_args()
    process_dataset(args.input_dir, args.output_dir)