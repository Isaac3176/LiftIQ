"""
Kalman filter implementations for LiftIQ.

Provides 1D and multi-dimensional Kalman filters for smoothing
velocity, acceleration, and position estimates.
"""

import math
from typing import List, Tuple, Optional


class KalmanFilter1D:
    """
    Simple 1D Kalman filter for smoothing scalar measurements.
    
    Good for smoothing velocity or acceleration estimates where
    the underlying process is approximately constant or slowly varying.
    
    Usage:
        kf = KalmanFilter1D(process_variance=1e-4, measurement_variance=0.1)
        smoothed = kf.update(noisy_measurement)
    """
    
    def __init__(
        self, 
        process_variance: float = 1e-4, 
        measurement_variance: float = 0.1,
        initial_estimate: float = 0.0,
        initial_error: float = 1.0
    ):
        """
        Initialize Kalman filter.
        
        Args:
            process_variance: Q - expected variance of state change per step.
                             Higher = trust measurements more, respond faster.
                             Lower = smoother output, slower response.
            measurement_variance: R - expected variance of measurements.
                                  Higher = trust measurements less.
                                  Lower = follow measurements more closely.
            initial_estimate: Starting value for state estimate.
            initial_error: Starting value for error covariance.
        
        Tuning guide:
            - For velocity: Q=1e-4 to 1e-3, R=0.05 to 0.2
            - For acceleration: Q=1e-3 to 1e-2, R=0.1 to 0.5
            - Increase Q if filter is too slow to respond
            - Increase R if output is too noisy
        """
        self.q = process_variance
        self.r = measurement_variance
        self.x = initial_estimate  # State estimate
        self.p = initial_error     # Error covariance
        
        # For diagnostics
        self.k = 0.0  # Last Kalman gain
    
    def update(self, measurement: float) -> float:
        """
        Update filter with new measurement.
        
        Args:
            measurement: New noisy measurement
        
        Returns:
            Smoothed estimate
        """
        # Predict step (state transition is identity for 1D)
        x_pred = self.x
        p_pred = self.p + self.q
        
        # Update step
        self.k = p_pred / (p_pred + self.r)
        self.x = x_pred + self.k * (measurement - x_pred)
        self.p = (1 - self.k) * p_pred
        
        return self.x
    
    def predict(self) -> float:
        """
        Predict next state without measurement update.
        
        Returns:
            Predicted state
        """
        return self.x
    
    def reset(self, value: float = 0.0, error: float = 1.0):
        """Reset filter to a known state."""
        self.x = value
        self.p = error
        self.k = 0.0
    
    def get_state(self) -> Tuple[float, float, float]:
        """
        Get current filter state.
        
        Returns:
            Tuple of (estimate, error_covariance, last_kalman_gain)
        """
        return (self.x, self.p, self.k)


class KalmanFilterVelocity:
    """
    2D Kalman filter for position-velocity estimation from acceleration.
    
    State vector: [position, velocity]
    Measurement: acceleration (integrated internally)
    
    This filter is specifically tuned for IMU-based velocity estimation
    with zero-velocity updates (ZUPT) for drift correction.
    """
    
    def __init__(
        self, 
        dt: float = 0.02,
        process_noise_accel: float = 0.5,
        measurement_noise: float = 0.1
    ):
        """
        Initialize velocity Kalman filter.
        
        Args:
            dt: Time step in seconds (1/sample_rate)
            process_noise_accel: Acceleration process noise (m/s²)
            measurement_noise: Measurement noise variance
        """
        self.dt = dt
        
        # State: [position, velocity]
        self.x = [0.0, 0.0]
        
        # Error covariance matrix (2x2)
        self.P = [[1.0, 0.0], 
                  [0.0, 1.0]]
        
        # Process noise covariance (based on acceleration uncertainty)
        q = process_noise_accel
        dt2 = dt * dt
        dt3 = dt2 * dt
        dt4 = dt3 * dt
        self.Q = [[dt4/4 * q, dt3/2 * q],
                  [dt3/2 * q, dt2 * q]]
        
        # Measurement noise
        self.R = measurement_noise
        
        # State transition matrix
        self.F = [[1.0, dt],
                  [0.0, 1.0]]
        
        # Control input matrix (acceleration -> state)
        self.B = [dt2/2, dt]
    
    def update(self, acceleration: float, velocity_measurement: Optional[float] = None) -> Tuple[float, float]:
        """
        Update filter with acceleration and optional velocity measurement.
        
        Args:
            acceleration: Linear acceleration in m/s²
            velocity_measurement: Optional direct velocity measurement (e.g., from ZUPT)
        
        Returns:
            Tuple of (position, velocity)
        """
        # Predict
        x_pred = [
            self.F[0][0] * self.x[0] + self.F[0][1] * self.x[1] + self.B[0] * acceleration,
            self.F[1][0] * self.x[0] + self.F[1][1] * self.x[1] + self.B[1] * acceleration
        ]
        
        P_pred = self._matrix_add(
            self._matrix_mult(self._matrix_mult(self.F, self.P), self._transpose(self.F)),
            self.Q
        )
        
        if velocity_measurement is not None:
            # Update with velocity measurement
            # H = [0, 1] (we measure velocity)
            H = [0.0, 1.0]
            
            # Innovation
            y = velocity_measurement - x_pred[1]
            
            # Innovation covariance
            S = P_pred[1][1] + self.R
            
            # Kalman gain
            K = [P_pred[0][1] / S, P_pred[1][1] / S]
            
            # Update state
            self.x = [x_pred[0] + K[0] * y, x_pred[1] + K[1] * y]
            
            # Update covariance
            self.P = [
                [P_pred[0][0] - K[0] * P_pred[1][0], P_pred[0][1] - K[0] * P_pred[1][1]],
                [P_pred[1][0] - K[1] * P_pred[1][0], P_pred[1][1] - K[1] * P_pred[1][1]]
            ]
        else:
            self.x = x_pred
            self.P = P_pred
        
        return (self.x[0], self.x[1])
    
    def zupt(self):
        """
        Zero-velocity update: apply measurement that velocity = 0.
        Call this when bar is known to be stationary.
        """
        self.update(0.0, velocity_measurement=0.0)
    
    def reset(self):
        """Reset filter to initial state."""
        self.x = [0.0, 0.0]
        self.P = [[1.0, 0.0], [0.0, 1.0]]
    
    def get_position(self) -> float:
        return self.x[0]
    
    def get_velocity(self) -> float:
        return self.x[1]
    
    # Matrix helper methods (avoiding numpy dependency for Pi)
    def _matrix_mult(self, A: List[List[float]], B: List[List[float]]) -> List[List[float]]:
        """Multiply two 2x2 matrices."""
        return [
            [A[0][0]*B[0][0] + A[0][1]*B[1][0], A[0][0]*B[0][1] + A[0][1]*B[1][1]],
            [A[1][0]*B[0][0] + A[1][1]*B[1][0], A[1][0]*B[0][1] + A[1][1]*B[1][1]]
        ]
    
    def _matrix_add(self, A: List[List[float]], B: List[List[float]]) -> List[List[float]]:
        """Add two 2x2 matrices."""
        return [
            [A[0][0] + B[0][0], A[0][1] + B[0][1]],
            [A[1][0] + B[1][0], A[1][1] + B[1][1]]
        ]
    
    def _transpose(self, A: List[List[float]]) -> List[List[float]]:
        """Transpose 2x2 matrix."""
        return [[A[0][0], A[1][0]], [A[0][1], A[1][1]]]


class AdaptiveKalmanFilter1D:
    """
    Adaptive 1D Kalman filter that adjusts process noise based on
    innovation (prediction error).
    
    Useful when the dynamics change (e.g., bar moving vs stationary).
    """
    
    def __init__(
        self,
        base_process_variance: float = 1e-4,
        measurement_variance: float = 0.1,
        adaptation_rate: float = 0.1,
        min_process_variance: float = 1e-6,
        max_process_variance: float = 1.0
    ):
        """
        Initialize adaptive Kalman filter.
        
        Args:
            base_process_variance: Starting Q value
            measurement_variance: R value (fixed)
            adaptation_rate: How quickly Q adapts (0-1)
            min_process_variance: Minimum Q value
            max_process_variance: Maximum Q value
        """
        self.q = base_process_variance
        self.q_base = base_process_variance
        self.r = measurement_variance
        self.x = 0.0
        self.p = 1.0
        
        self.alpha = adaptation_rate
        self.q_min = min_process_variance
        self.q_max = max_process_variance
        
        self.innovation_sq = 0.0  # Running estimate of innovation²
    
    def update(self, measurement: float) -> float:
        """Update with new measurement, adapting process noise."""
        # Predict
        x_pred = self.x
        p_pred = self.p + self.q
        
        # Compute innovation
        innovation = measurement - x_pred
        
        # Update innovation estimate (exponential moving average)
        self.innovation_sq = (1 - self.alpha) * self.innovation_sq + self.alpha * (innovation ** 2)
        
        # Adapt process noise based on innovation
        # If innovation is large, increase Q to respond faster
        expected_innovation_var = p_pred + self.r
        innovation_ratio = self.innovation_sq / max(expected_innovation_var, 1e-10)
        
        if innovation_ratio > 1.5:
            # Innovation larger than expected -> increase Q
            self.q = min(self.q * 1.5, self.q_max)
        elif innovation_ratio < 0.5:
            # Innovation smaller than expected -> decrease Q
            self.q = max(self.q * 0.8, self.q_min)
        else:
            # Slowly return to base
            self.q = self.q * 0.95 + self.q_base * 0.05
        
        # Standard Kalman update
        k = p_pred / (p_pred + self.r)
        self.x = x_pred + k * innovation
        self.p = (1 - k) * p_pred
        
        return self.x
    
    def reset(self, value: float = 0.0):
        """Reset filter state."""
        self.x = value
        self.p = 1.0
        self.q = self.q_base
        self.innovation_sq = 0.0


if __name__ == "__main__":
    import random
    
    # Test 1D filter
    print("Testing KalmanFilter1D:")
    kf = KalmanFilter1D(process_variance=1e-3, measurement_variance=0.5)
    
    true_value = 1.0
    measurements = [true_value + random.gauss(0, 0.5) for _ in range(20)]
    
    print(f"True value: {true_value}")
    print("Measurement -> Filtered:")
    for m in measurements:
        filtered = kf.update(m)
        print(f"  {m:.3f} -> {filtered:.3f}")
    
    # Test velocity filter
    print("\nTesting KalmanFilterVelocity:")
    vkf = KalmanFilterVelocity(dt=0.02)
    
    # Simulate constant acceleration
    accel = 2.0  # m/s²
    for i in range(50):
        pos, vel = vkf.update(accel)
        if i % 10 == 0:
            t = i * 0.02
            expected_vel = accel * t
            expected_pos = 0.5 * accel * t * t
            print(f"  t={t:.2f}s: vel={vel:.3f} (exp: {expected_vel:.3f}), pos={pos:.3f} (exp: {expected_pos:.3f})")
