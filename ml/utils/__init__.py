"""
ML Utilities for LiftIQ

Provides data preprocessing and validation utilities:
- resample: Resample sensor data to consistent frequency
- validate: Validate data quality and sample rates
"""

from .resample import (
    resample_to_hz,
    decimate,
    upsample,
    estimate_sample_rate,
    validate_sample_rate,
    g_to_ms2,
    ms2_to_g,
    deg_to_rad,
    rad_to_deg,
)

__all__ = [
    'resample_to_hz',
    'decimate',
    'upsample',
    'estimate_sample_rate',
    'validate_sample_rate',
    'g_to_ms2',
    'ms2_to_g',
    'deg_to_rad',
    'rad_to_deg',
]
