"""
Train Model 5 - Real-Time Fatigue & E1RM Predictor (Velocity-Based Training).

This is the offline counterpart to the on-device Model 5 logic:
  - src/context/CalibrationContext.js  (load-velocity regression -> E1RM)
  - raspi_files/pi/velocity.py         (velocity integration -> velocity loss)

Unlike the lift classifier (a deep CNN), Model 5 is intentionally lightweight
(linear regression, per the design doc). This script:

  1. Reconstructs per-rep bar velocity from each raw set, mirroring the Pi
     pipeline: vertical linear acceleration -> integrate (Euler) -> ZUPT drift
     correction -> velocity. Reps are segmented from concentric velocity peaks.
  2. Builds a per-set feature table (load, velocity, velocity loss, tempo).
  3. Fits a per-exercise load-velocity (L-V) profile -> estimated 1RM (the VBT
     method the app uses on-device, here validated/seeded from real data).
  4. Trains a lightweight fatigue model that predicts end-of-set velocity loss
     from the opening reps (does this set drive you toward failure?).

Input:  ml/data/recgym_raw/*.csv  (Apple Watch wrist IMU, 100 Hz)
Output: ml/models/fatigue_e1rm_model.json
        ml/reports/fatigue_model_metrics.json

Usage:
    python ml/scripts/train_fatigue_model.py
    python ml/scripts/train_fatigue_model.py --raw_dir ml/data/recgym_raw
"""

import os
import re
import json
import argparse
from pathlib import Path
from collections import defaultdict

import numpy as np
import pandas as pd

# Optional: sklearn gives us cross-validated fatigue metrics. Fall back to a
# plain numpy least-squares fit when it is not installed so the script always
# runs.
try:
    from sklearn.linear_model import Ridge
    from sklearn.model_selection import KFold
    from sklearn.metrics import mean_absolute_error, r2_score
    HAS_SKLEARN = True
except Exception:
    HAS_SKLEARN = False

# =============================================================================
# Configuration
# =============================================================================

RAW_DIR = 'ml/data/recgym_raw'
MODEL_DIR = 'ml/models'
REPORT_DIR = 'ml/reports'
MODEL_PATH = f'{MODEL_DIR}/fatigue_e1rm_model.json'
METRICS_PATH = f'{REPORT_DIR}/fatigue_model_metrics.json'

SAMPLE_RATE_HZ = 100.0
DT = 1.0 / SAMPLE_RATE_HZ
G = 9.80665  # m/s^2 per g

# Velocity reconstruction. The Pi runs ZUPT integration live (pi/velocity.py),
# but over a full offline set pure integration drifts without bar-stationary
# resets, so we high-pass (detrend) the signal - the standard way to recover
# bar velocity from a wrist IMU. Windows in samples at SAMPLE_RATE_HZ.
ACCEL_BIAS_WINDOW = 200         # ~2.0s: removes residual gravity-leak / bias
VEL_DETREND_WINDOW = 300        # ~3.0s: removes integration drift, keeps reps
VEL_SMOOTH_WINDOW = 5           # moving-average smoothing on velocity (samples)

# Rep segmentation
MIN_REP_PEAK_VELOCITY = 0.05    # m/s, ignore micro-peaks below this
MIN_REP_SEPARATION_SEC = 0.4    # min spacing between concentric peaks

# Minimum sets needed to fit a per-exercise load-velocity profile
MIN_LOADS_FOR_PROFILE = 2

# Fatigue level thresholds (% velocity loss). Mirrors SessionSummaryScreen.js.
FATIGUE_BANDS = [
    (10.0, 'low'),
    (20.0, 'moderate'),
    (30.0, 'high'),
    (float('inf'), 'very_high'),
]

# Per-exercise minimum velocity thresholds (m/s) used to extrapolate 1RM.
# Seeded from E1RM_VELOCITIES in CalibrationContext.js.
TARGET_VELOCITIES = {
    'MIBP': 0.17, 'SMS': 0.30, 'OHP': 0.20, 'SBLP': 0.22,
    'CGCR': 0.22, 'NGCR': 0.22, 'APULL': 0.22, 'DEFAULT': 0.20,
}

ACCEL_COLS = ['wristMotion_accelerationX', 'wristMotion_accelerationY', 'wristMotion_accelerationZ']
GRAV_COLS = ['wristMotion_gravityX', 'wristMotion_gravityY', 'wristMotion_gravityZ']

# Filename: ddmmyy_CODE_Wxx[_x]_Sx[_Rxx]-timestamp.csv (underscore = decimal)
FILENAME_RE = re.compile(r'^\d+_([A-Z0-9]+)_W([0-9_]+?)_S\d+', re.IGNORECASE)


# =============================================================================
# Helpers
# =============================================================================

def target_velocity(code: str) -> float:
    return TARGET_VELOCITIES.get(code, TARGET_VELOCITIES['DEFAULT'])


def fatigue_level(loss_pct: float) -> str:
    for threshold, label in FATIGUE_BANDS:
        if loss_pct < threshold:
            return label
    return 'very_high'


def parse_metadata(df: pd.DataFrame, filename: str):
    """Resolve exercise code and load (kg) from CSV columns, then filename."""
    code, load = None, None

    if 'activity' in df.columns:
        vals = df['activity'].dropna().unique()
        if len(vals):
            code = str(vals[0]).strip()
    if 'weight' in df.columns:
        vals = df['weight'].dropna().unique()
        if len(vals):
            try:
                load = float(vals[0])
            except (TypeError, ValueError):
                load = None

    if code is None or load is None:
        m = FILENAME_RE.match(Path(filename).name)
        if m:
            code = code or m.group(1).upper()
            if load is None:
                load = float(m.group(2).replace('_', '.'))

    return code, load


def _moving_average(x: np.ndarray, window: int) -> np.ndarray:
    """Centered moving average, edge-padded (used as a low-pass for detrending)."""
    window = min(window, len(x))
    if window < 2:
        return x
    pad = window // 2
    padded = np.pad(x, pad, mode='edge')
    kernel = np.ones(window) / window
    smoothed = np.convolve(padded, kernel, mode='same')
    return smoothed[pad:pad + len(x)]


def compute_velocity_series(accel_g: np.ndarray, grav: np.ndarray) -> np.ndarray:
    """
    Reconstruct vertical bar velocity (m/s) from wrist IMU.

    Vertical accel = projection of user acceleration onto the (down) gravity
    axis (same physics as the Pi's gravity removal). It is then high-pass
    detrended before and after integration to reject sensor bias and the
    integration drift that otherwise dominates a full set.
    """
    grav_mag = np.linalg.norm(grav, axis=1, keepdims=True)
    grav_mag[grav_mag < 1e-6] = 1.0
    grav_unit = grav / grav_mag

    # Up-positive vertical acceleration in m/s^2, de-biased (high-pass).
    a_vert = -np.sum(accel_g * grav_unit, axis=1) * G
    a_vert = a_vert - _moving_average(a_vert, ACCEL_BIAS_WINDOW)

    # Integrate to velocity, then detrend to remove integration drift.
    velocity = np.cumsum(a_vert) * DT
    velocity = velocity - _moving_average(velocity, VEL_DETREND_WINDOW)

    if VEL_SMOOTH_WINDOW > 1:
        velocity = _moving_average(velocity, VEL_SMOOTH_WINDOW)

    return velocity


def segment_rep_peaks(velocity: np.ndarray) -> list:
    """Peak concentric (upward) velocity per detected rep.

    The threshold adapts to each set's own velocity scale so wrist-sensor noise
    spikes are not counted as reps (a fixed floor over-segments).
    """
    pos = velocity[velocity > 0]
    if len(pos) == 0:
        return []
    adaptive = 0.4 * float(np.percentile(pos, 90))
    peak_thresh = max(MIN_REP_PEAK_VELOCITY, adaptive)

    min_sep = int(MIN_REP_SEPARATION_SEC * SAMPLE_RATE_HZ)
    peaks = []
    in_rep = False
    cur_peak = 0.0
    cur_peak_idx = -1
    last_peak_idx = -10 ** 9

    for i, v in enumerate(velocity):
        if v > peak_thresh:
            in_rep = True
            if v > cur_peak:
                cur_peak = v
                cur_peak_idx = i
        elif in_rep and v <= 0:
            # Concentric phase ended.
            if cur_peak_idx - last_peak_idx >= min_sep:
                peaks.append(cur_peak)
                last_peak_idx = cur_peak_idx
            in_rep = False
            cur_peak = 0.0
            cur_peak_idx = -1

    if in_rep and cur_peak > peak_thresh:
        peaks.append(cur_peak)

    return peaks


def extract_set_features(filepath: str):
    """One raw set CSV -> a feature dict, or None if unusable."""
    try:
        df = pd.read_csv(filepath)
    except Exception as e:
        return None, f'read_error: {e}'

    code, load = parse_metadata(df, filepath)
    if not code or load is None or load <= 0:
        return None, 'missing_metadata'

    missing = [c for c in ACCEL_COLS + GRAV_COLS if c not in df.columns]
    if missing:
        return None, f'missing_cols: {missing}'

    motion = df[ACCEL_COLS + GRAV_COLS].dropna()
    if len(motion) < int(SAMPLE_RATE_HZ):  # need >= ~1s of motion
        return None, 'too_short'

    accel_g = motion[ACCEL_COLS].to_numpy(dtype=np.float64)
    grav = motion[GRAV_COLS].to_numpy(dtype=np.float64)

    velocity = compute_velocity_series(accel_g, grav)
    rep_peaks = segment_rep_peaks(velocity)
    if len(rep_peaks) < 2:
        return None, 'reps_unsegmentable'

    rep_peaks = np.asarray(rep_peaks, dtype=np.float64)
    concentric = velocity[velocity > 0]

    declared_reps = None
    if 'reps' in df.columns:
        vals = df['reps'].dropna().unique()
        if len(vals):
            declared_reps = int(float(vals[0]))

    first_peak = float(rep_peaks[0])
    last_peak = float(rep_peaks[-1])
    velocity_loss = max(0.0, min(100.0, (1.0 - last_peak / first_peak) * 100.0)) if first_peak > 0 else 0.0

    return {
        'file': Path(filepath).name,
        'exercise': code,
        'load_kg': round(load, 2),
        'declared_reps': declared_reps,
        'detected_reps': int(len(rep_peaks)),
        'first_rep_peak_v': round(first_peak, 4),
        'last_rep_peak_v': round(last_peak, 4),
        'mean_peak_v': round(float(rep_peaks.mean()), 4),
        'mean_concentric_v': round(float(concentric.mean()) if len(concentric) else 0.0, 4),
        'peak_v': round(float(rep_peaks.max()), 4),
        'velocity_loss_pct': round(velocity_loss, 2),
        'fatigue_level': fatigue_level(velocity_loss),
        'motion_sec': round(len(velocity) * DT, 2),
    }, None


# =============================================================================
# Load-velocity (VBT) profiles
# =============================================================================

def fit_linear(x: np.ndarray, y: np.ndarray):
    """Least-squares y = slope*x + intercept with R^2."""
    n = len(x)
    if n < 2:
        return None
    mean_x, mean_y = x.mean(), y.mean()
    denom = float(((x - mean_x) ** 2).sum())
    if denom == 0:
        return None
    slope = float(((x - mean_x) * (y - mean_y)).sum() / denom)
    intercept = float(mean_y - slope * mean_x)
    pred = slope * x + intercept
    ss_res = float(((y - pred) ** 2).sum())
    ss_tot = float(((y - mean_y) ** 2).sum())
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
    return slope, intercept, r2


def build_velocity_profiles(sets: pd.DataFrame) -> dict:
    """Per-exercise load -> mean concentric velocity regression -> E1RM."""
    profiles = {}
    for code, grp in sets.groupby('exercise'):
        loads = grp['load_kg'].to_numpy(dtype=np.float64)
        vels = grp['mean_concentric_v'].to_numpy(dtype=np.float64)
        if len(np.unique(loads)) < MIN_LOADS_FOR_PROFILE:
            continue
        fit = fit_linear(loads, vels)
        if fit is None:
            continue
        slope, intercept, r2 = fit

        mvt = target_velocity(code)
        est_1rm = None
        # Inverse L-V: load at the minimum velocity threshold. Only trustworthy
        # when velocity genuinely falls with load (negative slope) AND the fit
        # explains most of the variance - otherwise extrapolation is noise.
        max_load = float(loads.max())
        if slope < 0 and r2 >= 0.5:
            load_at_mvt = (mvt - intercept) / slope
            if max_load < load_at_mvt < min(1000.0, 5 * max_load):
                est_1rm = round(load_at_mvt, 1)

        profiles[code] = {
            'n_sets': int(len(grp)),
            'n_loads': int(len(np.unique(loads))),
            'load_range_kg': [round(float(loads.min()), 1), round(float(loads.max()), 1)],
            'slope': round(slope, 6),
            'intercept': round(intercept, 4),
            'r_squared': round(r2, 3),
            'target_velocity_ms': mvt,
            'estimated_1rm_kg': est_1rm,
            'mean_velocity_loss_pct': round(float(grp['velocity_loss_pct'].mean()), 2),
        }
    return profiles


# =============================================================================
# Fatigue model (predict end-of-set velocity loss from the opening reps)
# =============================================================================

def train_fatigue_model(sets: pd.DataFrame):
    """
    Lightweight Ridge regression: predict a set's velocity-loss % from features
    available early in the set (load, opening-rep velocity, exercise tendency).
    """
    feats = sets.copy()
    # Per-exercise mean velocity loss as a learned "exercise fatigue tendency".
    ex_bias = feats.groupby('exercise')['velocity_loss_pct'].transform('mean')
    X = np.column_stack([
        feats['load_kg'].to_numpy(dtype=np.float64),
        feats['first_rep_peak_v'].to_numpy(dtype=np.float64),
        feats['detected_reps'].to_numpy(dtype=np.float64),
        ex_bias.to_numpy(dtype=np.float64),
    ])
    y = feats['velocity_loss_pct'].to_numpy(dtype=np.float64)
    feature_names = ['load_kg', 'first_rep_peak_v', 'detected_reps', 'exercise_fatigue_bias']

    # Standardize for stable coefficients.
    mu = X.mean(axis=0)
    sigma = X.std(axis=0)
    sigma[sigma == 0] = 1.0
    Xs = (X - mu) / sigma

    result = {
        'feature_names': feature_names,
        'feature_mean': mu.round(4).tolist(),
        'feature_std': sigma.round(4).tolist(),
        'n_samples': int(len(y)),
        'target': 'velocity_loss_pct',
    }

    if HAS_SKLEARN and len(y) >= 10:
        model = Ridge(alpha=1.0)
        kf = KFold(n_splits=5, shuffle=True, random_state=42)
        maes, r2s = [], []
        for tr, te in kf.split(Xs):
            model.fit(Xs[tr], y[tr])
            pred = model.predict(Xs[te])
            maes.append(mean_absolute_error(y[te], pred))
            r2s.append(r2_score(y[te], pred) if len(te) > 1 else 0.0)
        model.fit(Xs, y)
        result.update({
            'method': 'ridge',
            'coefficients': model.coef_.round(4).tolist(),
            'intercept': round(float(model.intercept_), 4),
            'cv_mae': round(float(np.mean(maes)), 3),
            'cv_r2': round(float(np.mean(r2s)), 3),
        })
    else:
        # numpy least squares fallback (no cross-validation).
        A = np.column_stack([Xs, np.ones(len(Xs))])
        coef, *_ = np.linalg.lstsq(A, y, rcond=None)
        pred = A @ coef
        ss_res = float(((y - pred) ** 2).sum())
        ss_tot = float(((y - y.mean()) ** 2).sum())
        result.update({
            'method': 'numpy_lstsq' + ('' if HAS_SKLEARN else '_no_sklearn'),
            'coefficients': coef[:-1].round(4).tolist(),
            'intercept': round(float(coef[-1]), 4),
            'train_mae': round(float(np.abs(y - pred).mean()), 3),
            'train_r2': round(1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0, 3),
        })

    return result


# =============================================================================
# Main
# =============================================================================

def main(raw_dir: str):
    Path(MODEL_DIR).mkdir(parents=True, exist_ok=True)
    Path(REPORT_DIR).mkdir(parents=True, exist_ok=True)

    csv_files = sorted(Path(raw_dir).glob('**/*.csv'))
    print(f"Found {len(csv_files)} raw set files in {raw_dir}")
    if not csv_files:
        print("No data. Run: python ml/scripts/download_recgym.py")
        return

    rows = []
    skipped = defaultdict(int)
    for i, f in enumerate(csv_files):
        if (i + 1) % 30 == 0 or (i + 1) == len(csv_files):
            print(f"  processed {i + 1}/{len(csv_files)}...")
        feat, reason = extract_set_features(str(f))
        if feat is None:
            skipped[reason.split(':')[0]] += 1
            continue
        rows.append(feat)

    if not rows:
        print("\nNo usable sets extracted.")
        for reason, n in skipped.items():
            print(f"  skipped ({reason}): {n}")
        return

    sets = pd.DataFrame(rows)
    print(f"\nUsable sets: {len(sets)} across {sets['exercise'].nunique()} exercises")
    print(f"Skipped: {dict(skipped)}")

    profiles = build_velocity_profiles(sets)
    print(f"\nFitted load-velocity profiles for {len(profiles)} exercises "
          f"(>= {MIN_LOADS_FOR_PROFILE} distinct loads):")
    for code, p in sorted(profiles.items(), key=lambda kv: -kv[1]['r_squared']):
        e1rm = f"{p['estimated_1rm_kg']}kg" if p['estimated_1rm_kg'] else "n/a"
        print(f"  {code:<8} slope={p['slope']:+.4f}  R2={p['r_squared']:.2f}  "
              f"loads={p['n_loads']}  E1RM={e1rm}")

    fatigue = train_fatigue_model(sets)
    print(f"\nFatigue model ({fatigue['method']}): "
          + (f"CV MAE={fatigue.get('cv_mae')}%  CV R2={fatigue.get('cv_r2')}"
             if 'cv_mae' in fatigue
             else f"train MAE={fatigue.get('train_mae')}%  train R2={fatigue.get('train_r2')}"))

    # Persist deployable model params.
    model = {
        'model': 'fatigue_e1rm',
        'version': 1,
        'description': 'Model 5 - VBT fatigue & E1RM predictor',
        'sample_rate_hz': SAMPLE_RATE_HZ,
        'target_velocities': TARGET_VELOCITIES,
        'fatigue_bands': [{'max_loss_pct': None if t == float('inf') else t, 'level': l}
                          for t, l in FATIGUE_BANDS],
        'velocity_profiles': profiles,
        'fatigue_model': fatigue,
    }
    with open(MODEL_PATH, 'w') as fh:
        json.dump(model, fh, indent=2)

    # Report.
    loss = sets['velocity_loss_pct']
    metrics = {
        'dataset': 'Kaggle Gym Workout IMU Dataset',
        'sets_total': int(len(csv_files)),
        'sets_used': int(len(sets)),
        'sets_skipped': dict(skipped),
        'exercises': int(sets['exercise'].nunique()),
        'profiled_exercises': len(profiles),
        'sklearn_available': HAS_SKLEARN,
        'velocity_loss_stats': {
            'mean_pct': round(float(loss.mean()), 2),
            'median_pct': round(float(loss.median()), 2),
            'max_pct': round(float(loss.max()), 2),
        },
        'fatigue_level_distribution': {k: int(v) for k, v in sets['fatigue_level'].value_counts().items()},
        'profile_r_squared': {c: p['r_squared'] for c, p in profiles.items()},
        'fatigue_model': {k: fatigue[k] for k in fatigue if k not in ('feature_mean', 'feature_std')},
    }
    with open(METRICS_PATH, 'w') as fh:
        json.dump(metrics, fh, indent=2)

    print(f"\n{'=' * 50}\nCOMPLETE\n{'=' * 50}")
    print(f"Model:   {MODEL_PATH}")
    print(f"Metrics: {METRICS_PATH}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train Model 5 fatigue & E1RM predictor")
    parser.add_argument('--raw_dir', type=str, default=RAW_DIR)
    args = parser.parse_args()
    main(args.raw_dir)
