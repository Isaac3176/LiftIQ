"""
LiftIQ Physics Pipeline

This module provides real-time bar tracking using IMU sensor fusion:
- OrientationFilter: Madgwick AHRS for roll/pitch/yaw estimation
- GravityRemover: Removes gravity to get linear acceleration
- KalmanFilter1D: 1D Kalman filter for smoothing
- VelocityEstimator: Integrates acceleration to velocity with ZUPT
- ROMEstimator: Tracks range of motion per rep

Usage:
    from pi import OrientationFilter, GravityRemover, VelocityEstimator, ROMEstimator
    
    orientation = OrientationFilter(sample_rate_hz=50)
    gravity = GravityRemover()
    velocity = VelocityEstimator(sample_rate_hz=50)
    rom = ROMEstimator(sample_rate_hz=50)
    
    # In main loop:
    roll, pitch, yaw = orientation.update(ax, ay, az, gx, gy, gz)
    a_lin_x, a_lin_y, a_lin_z = gravity.remove_gravity(ax, ay, az, roll, pitch, yaw)
    vel = velocity.update(a_lin_z, is_stable=(state == "WAITING"))
    displacement = rom.update(vel)
"""

from .orientation import OrientationFilter, ComplementaryFilter
from .gravity import GravityRemover, AdaptiveGravityRemover, rotate_to_world_frame
from .kalman import KalmanFilter1D, KalmanFilterVelocity, AdaptiveKalmanFilter1D
from .velocity import VelocityEstimator, VelocityEstimatorAdvanced
from .rom import ROMEstimator, meters_to_cm, meters_to_inches

__all__ = [
    # Orientation
    'OrientationFilter',
    'ComplementaryFilter',
    
    # Gravity
    'GravityRemover',
    'AdaptiveGravityRemover',
    'rotate_to_world_frame',
    
    # Kalman
    'KalmanFilter1D',
    'KalmanFilterVelocity',
    'AdaptiveKalmanFilter1D',
    
    # Velocity
    'VelocityEstimator',
    'VelocityEstimatorAdvanced',
    
    # ROM
    'ROMEstimator',
    'meters_to_cm',
    'meters_to_inches',
]

__version__ = '1.0.0'
