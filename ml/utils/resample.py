"""
Resampling utility for LiftIQ sensor data.

Provides functions to resample IMU data to a consistent target frequency.
"""

import math
from typing import List, Dict, Any, Optional


def resample_to_hz(
    samples: List[Dict[str, Any]], 
    source_hz: float, 
    target_hz: float,
    timestamp_key: str = "timestamp"
) -> List[Dict[str, Any]]:
    """
    Resample sensor data to target frequency using linear interpolation.
    
    Args:
        samples: List of sensor packets (dicts with timestamp + sensor fields)
        source_hz: Original sample rate (used for validation, actual timing from timestamps)
        target_hz: Desired sample rate
        timestamp_key: Key name for timestamp field
    
    Returns:
        Resampled list of sensor packets at target_hz
    
    Example:
        >>> data = [{"timestamp": 0.0, "ax": 1.0}, {"timestamp": 0.01, "ax": 2.0}]
        >>> resampled = resample_to_hz(data, source_hz=100, target_hz=50)
    """
    if not samples or len(samples) < 2:
        return samples.copy() if samples else []
    
    # Get time bounds
    t_start = samples[0][timestamp_key]
    t_end = samples[-1][timestamp_key]
    duration = t_end - t_start
    
    if duration <= 0:
        return [samples[0].copy()]
    
    # Generate target timestamps
    dt = 1.0 / target_hz
    n_samples = int(duration * target_hz) + 1
    target_times = [t_start + i * dt for i in range(n_samples)]
    
    # Get numeric fields to interpolate
    numeric_fields = []
    for key, value in samples[0].items():
        if key != timestamp_key and isinstance(value, (int, float)):
            numeric_fields.append(key)
    
    # Resample using linear interpolation
    resampled = []
    src_idx = 0
    
    for t_target in target_times:
        # Find bracketing samples
        while src_idx < len(samples) - 1 and samples[src_idx + 1][timestamp_key] <= t_target:
            src_idx += 1
        
        if src_idx >= len(samples) - 1:
            # At or past end, use last sample
            resampled.append(samples[-1].copy())
            resampled[-1][timestamp_key] = t_target
            continue
        
        # Interpolate between src_idx and src_idx + 1
        s0 = samples[src_idx]
        s1 = samples[src_idx + 1]
        t0 = s0[timestamp_key]
        t1 = s1[timestamp_key]
        
        if t1 == t0:
            alpha = 0.0
        else:
            alpha = (t_target - t0) / (t1 - t0)
        
        # Create interpolated sample
        new_sample = {timestamp_key: t_target}
        for field in numeric_fields:
            v0 = s0.get(field, 0.0)
            v1 = s1.get(field, 0.0)
            new_sample[field] = v0 + alpha * (v1 - v0)
        
        # Copy non-numeric fields from nearest sample
        nearest = s0 if alpha < 0.5 else s1
        for key, value in nearest.items():
            if key not in new_sample:
                new_sample[key] = value
        
        resampled.append(new_sample)
    
    return resampled


def decimate(
    samples: List[Dict[str, Any]], 
    factor: int,
    timestamp_key: str = "timestamp"
) -> List[Dict[str, Any]]:
    """
    Reduce sample rate by keeping every Nth sample.
    
    Args:
        samples: List of sensor packets
        factor: Decimation factor (keep every factor-th sample)
        timestamp_key: Key name for timestamp field
    
    Returns:
        Decimated list (length = original_length / factor)
    
    Example:
        >>> data = [{"t": i*0.01} for i in range(100)]  # 100 Hz
        >>> decimated = decimate(data, factor=2)  # Now 50 Hz
    """
    if factor <= 1:
        return samples.copy()
    
    return [samples[i].copy() for i in range(0, len(samples), factor)]


def upsample(
    samples: List[Dict[str, Any]], 
    factor: int,
    timestamp_key: str = "timestamp"
) -> List[Dict[str, Any]]:
    """
    Increase sample rate by linear interpolation.
    
    Args:
        samples: List of sensor packets
        factor: Upsampling factor (insert factor-1 samples between each pair)
        timestamp_key: Key name for timestamp field
    
    Returns:
        Upsampled list (length = (original_length - 1) * factor + 1)
    """
    if factor <= 1 or len(samples) < 2:
        return samples.copy() if samples else []
    
    # Get numeric fields
    numeric_fields = [
        k for k, v in samples[0].items() 
        if k != timestamp_key and isinstance(v, (int, float))
    ]
    
    upsampled = []
    
    for i in range(len(samples) - 1):
        s0 = samples[i]
        s1 = samples[i + 1]
        t0 = s0[timestamp_key]
        t1 = s1[timestamp_key]
        
        for j in range(factor):
            alpha = j / factor
            t = t0 + alpha * (t1 - t0)
            
            new_sample = {timestamp_key: t}
            for field in numeric_fields:
                v0 = s0.get(field, 0.0)
                v1 = s1.get(field, 0.0)
                new_sample[field] = v0 + alpha * (v1 - v0)
            
            # Copy non-numeric from nearest
            nearest = s0 if alpha < 0.5 else s1
            for key, value in nearest.items():
                if key not in new_sample:
                    new_sample[key] = value
            
            upsampled.append(new_sample)
    
    # Add final sample
    upsampled.append(samples[-1].copy())
    
    return upsampled


def estimate_sample_rate(
    samples: List[Dict[str, Any]], 
    timestamp_key: str = "timestamp"
) -> Optional[float]:
    """
    Estimate the sample rate from timestamps.
    
    Args:
        samples: List of sensor packets with timestamps
        timestamp_key: Key name for timestamp field
    
    Returns:
        Estimated sample rate in Hz, or None if cannot determine
    """
    if len(samples) < 2:
        return None
    
    t_start = samples[0][timestamp_key]
    t_end = samples[-1][timestamp_key]
    duration = t_end - t_start
    
    if duration <= 0:
        return None
    
    return (len(samples) - 1) / duration


def validate_sample_rate(
    samples: List[Dict[str, Any]], 
    expected_hz: float,
    tolerance_pct: float = 10.0,
    timestamp_key: str = "timestamp"
) -> Dict[str, Any]:
    """
    Validate that sample rate matches expected rate.
    
    Args:
        samples: List of sensor packets
        expected_hz: Expected sample rate
        tolerance_pct: Acceptable deviation percentage
        timestamp_key: Key name for timestamp field
    
    Returns:
        Dict with validation results:
        {
            "valid": bool,
            "estimated_hz": float,
            "deviation_pct": float,
            "jitter_ms": float (std dev of sample intervals)
        }
    """
    if len(samples) < 2:
        return {
            "valid": False,
            "estimated_hz": None,
            "deviation_pct": None,
            "jitter_ms": None,
            "error": "Need at least 2 samples"
        }
    
    estimated = estimate_sample_rate(samples, timestamp_key)
    deviation_pct = abs(estimated - expected_hz) / expected_hz * 100.0
    
    # Calculate jitter
    intervals = []
    for i in range(1, len(samples)):
        dt = samples[i][timestamp_key] - samples[i-1][timestamp_key]
        intervals.append(dt)
    
    mean_interval = sum(intervals) / len(intervals)
    variance = sum((dt - mean_interval) ** 2 for dt in intervals) / len(intervals)
    jitter_ms = math.sqrt(variance) * 1000.0
    
    return {
        "valid": deviation_pct <= tolerance_pct,
        "estimated_hz": round(estimated, 2),
        "deviation_pct": round(deviation_pct, 2),
        "jitter_ms": round(jitter_ms, 3)
    }


# Unit conversion helpers
def g_to_ms2(accel_g: float) -> float:
    """Convert acceleration from g-units to m/s²."""
    return accel_g * 9.81


def ms2_to_g(accel_ms2: float) -> float:
    """Convert acceleration from m/s² to g-units."""
    return accel_ms2 / 9.81


def deg_to_rad(degrees: float) -> float:
    """Convert degrees to radians."""
    return degrees * math.pi / 180.0


def rad_to_deg(radians: float) -> float:
    """Convert radians to degrees."""
    return radians * 180.0 / math.pi


if __name__ == "__main__":
    # Simple test
    test_data = [
        {"timestamp": 0.00, "ax": 0.0, "ay": 0.0, "az": 9.81},
        {"timestamp": 0.01, "ax": 0.1, "ay": 0.0, "az": 9.81},
        {"timestamp": 0.02, "ax": 0.2, "ay": 0.0, "az": 9.80},
        {"timestamp": 0.03, "ax": 0.3, "ay": 0.0, "az": 9.79},
        {"timestamp": 0.04, "ax": 0.4, "ay": 0.0, "az": 9.78},
    ]
    
    print("Original (100 Hz):")
    for s in test_data:
        print(f"  t={s['timestamp']:.3f}, ax={s['ax']:.2f}")
    
    resampled = resample_to_hz(test_data, source_hz=100, target_hz=50)
    print("\nResampled to 50 Hz:")
    for s in resampled:
        print(f"  t={s['timestamp']:.3f}, ax={s['ax']:.2f}")
    
    validation = validate_sample_rate(test_data, expected_hz=100)
    print(f"\nValidation: {validation}")
