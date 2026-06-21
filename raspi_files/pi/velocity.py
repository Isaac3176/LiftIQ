"""
Velocity estimation for LiftIQ.

Estimates bar velocity by integrating linear acceleration.
Includes drift correction via zero-velocity updates (ZUPT)
when the bar is detected as stationary.
"""

import math
from typing import List, Tuple, Optional, Dict, Any
from .kalman import KalmanFilter1D, KalmanFilterVelocity


class VelocityEstimator:
    """
    Estimate bar velocity from linear acceleration.
    
    Integrates acceleration over time to get velocity.
    Uses Kalman filtering for smoothing and ZUPT for drift correction.
    
    Usage:
        estimator = VelocityEstimator(sample_rate_hz=50)
        velocity = estimator.update(a_lin_z, is_stable=False)
        
        # When bar is stationary:
        velocity = estimator.update(a_lin_z, is_stable=True)  # Applies ZUPT
    """
    
    def __init__(
        self, 
        sample_rate_hz: float = 50.0,
        use_kalman: bool = True,
        process_variance: float = 1e-3,
        measurement_variance: float = 0.1
    ):
        """
        Initialize velocity estimator.
        
        Args:
            sample_rate_hz: IMU sample rate
            use_kalman: Whether to apply Kalman smoothing
            process_variance: Kalman Q parameter
            measurement_variance: Kalman R parameter
        """
        self.dt = 1.0 / sample_rate_hz
        self.use_kalman = use_kalman
        
        # Velocity state
        self.velocity = 0.0
        self.velocity_raw = 0.0  # Pre-Kalman velocity
        
        # Kalman filter for smoothing
        self.kalman = KalmanFilter1D(
            process_variance=process_variance,
            measurement_variance=measurement_variance
        )
        
        # History for analysis
        self.velocity_history: List[float] = []
        self.time_history: List[float] = []
        self._current_time = 0.0
        
        # Rep segmentation
        self.in_rep = False
        self.rep_velocities: List[Dict[str, float]] = []
        self._current_rep_velocities: List[float] = []
        self._current_rep_times: List[float] = []
        self._rep_count = 0
        
        # ZUPT parameters
        self.zupt_threshold = 0.05  # m/s² - consider stationary below this
        self.zupt_count = 0
        self.zupt_samples_required = 5  # Need N consecutive stable samples
        
        # Drift tracking
        self._drift_estimate = 0.0
        self._drift_alpha = 0.001  # Slow drift adaptation
    
    def update(
        self, 
        a_lin_vertical: float, 
        is_stable: bool = False,
        timestamp: Optional[float] = None
    ) -> float:
        """
        Update velocity estimate with new acceleration.
        
        Args:
            a_lin_vertical: Vertical linear acceleration (m/s²)
                           Positive = upward acceleration
            is_stable: True if bar is known to be stationary
                      Triggers zero-velocity update (ZUPT)
            timestamp: Optional timestamp (uses internal counter if not provided)
        
        Returns:
            Current velocity estimate (m/s)
            Positive = moving upward
        """
        # Update time
        if timestamp is not None:
            self._current_time = timestamp
        else:
            self._current_time += self.dt
        
        if is_stable:
            # Zero-velocity update (ZUPT)
            self._apply_zupt()
        else:
            # Normal integration
            # Trapezoidal integration would be better, but simple Euler is sufficient
            # at 50Hz with Kalman smoothing
            self.velocity_raw += a_lin_vertical * self.dt
            
            # Apply slow drift correction
            self.velocity_raw -= self._drift_estimate * self.dt
            
            # Kalman smoothing
            if self.use_kalman:
                self.velocity = self.kalman.update(self.velocity_raw)
            else:
                self.velocity = self.velocity_raw
        
        # Track history
        self.velocity_history.append(self.velocity)
        self.time_history.append(self._current_time)
        
        # Track rep velocities if in rep
        if self.in_rep:
            self._current_rep_velocities.append(self.velocity)
            self._current_rep_times.append(self._current_time)
        
        return self.velocity
    
    def _apply_zupt(self):
        """Apply zero-velocity update."""
        # Estimate drift from current velocity
        # When we know velocity should be 0, any remaining velocity is drift
        self._drift_estimate = (
            (1 - self._drift_alpha) * self._drift_estimate + 
            self._drift_alpha * self.velocity_raw / max(self._current_time, 1.0)
        )
        
        # Reset velocity
        self.velocity = 0.0
        self.velocity_raw = 0.0
        self.kalman.reset(0.0)
    
    def on_rep_start(self):
        """
        Mark the start of a new rep.
        Call this when rep detection triggers.
        """
        self.in_rep = True
        self._current_rep_velocities = []
        self._current_rep_times = []
    
    def on_rep_complete(self) -> Dict[str, Any]:
        """
        Mark the end of a rep and compute metrics.
        
        Returns:
            Dict with rep velocity metrics:
            {
                'rep_number': int,
                'peak_velocity': float (m/s),
                'mean_concentric_velocity': float (m/s),
                'mean_eccentric_velocity': float (m/s),
                'time_to_peak': float (seconds),
            }
        """
        self.in_rep = False
        self._rep_count += 1
        
        if not self._current_rep_velocities:
            return {
                'rep_number': self._rep_count,
                'peak_velocity': 0.0,
                'mean_concentric_velocity': 0.0,
                'mean_eccentric_velocity': 0.0,
                'time_to_peak': 0.0,
            }
        
        velocities = self._current_rep_velocities
        times = self._current_rep_times
        
        # Peak velocity (maximum upward velocity)
        peak_velocity = max(velocities)
        peak_idx = velocities.index(peak_velocity)
        
        # Time to peak (from start of rep)
        time_to_peak = times[peak_idx] - times[0] if times else 0.0
        
        # Concentric = positive velocity (lifting up)
        concentric = [v for v in velocities if v > 0]
        mean_concentric = sum(concentric) / len(concentric) if concentric else 0.0
        
        # Eccentric = negative velocity (lowering down)
        eccentric = [abs(v) for v in velocities if v < 0]
        mean_eccentric = sum(eccentric) / len(eccentric) if eccentric else 0.0
        
        metrics = {
            'rep_number': self._rep_count,
            'peak_velocity': round(peak_velocity, 3),
            'mean_concentric_velocity': round(mean_concentric, 3),
            'mean_eccentric_velocity': round(mean_eccentric, 3),
            'time_to_peak': round(time_to_peak, 3),
        }
        
        self.rep_velocities.append(metrics)
        return metrics
    
    def get_velocity_loss_pct(self) -> Optional[float]:
        """
        Calculate velocity loss across set (fatigue indicator).
        
        Compares peak velocity of first rep to last rep.
        Velocity loss > 20% typically indicates significant fatigue.
        
        Returns:
            Percentage drop from first rep to last rep (0-100),
            or None if < 2 reps recorded
        """
        if len(self.rep_velocities) < 2:
            return None
        
        first_peak = self.rep_velocities[0]['peak_velocity']
        last_peak = self.rep_velocities[-1]['peak_velocity']
        
        if first_peak <= 0:
            return None
        
        loss = (1.0 - last_peak / first_peak) * 100.0
        return round(max(0.0, min(100.0, loss)), 2)
    
    def get_average_peak_velocity(self) -> Optional[float]:
        """Get average peak velocity across all reps."""
        if not self.rep_velocities:
            return None
        
        peaks = [r['peak_velocity'] for r in self.rep_velocities]
        return round(sum(peaks) / len(peaks), 3)
    
    def get_current_velocity(self) -> float:
        """Get current velocity estimate."""
        return self.velocity
    
    def get_rep_velocities(self) -> List[Dict[str, Any]]:
        """Get velocity metrics for all completed reps."""
        return self.rep_velocities.copy()
    
    def reset(self):
        """Reset all state for new session."""
        self.velocity = 0.0
        self.velocity_raw = 0.0
        self.kalman.reset(0.0)
        self.velocity_history = []
        self.time_history = []
        self._current_time = 0.0
        self.in_rep = False
        self.rep_velocities = []
        self._current_rep_velocities = []
        self._current_rep_times = []
        self._rep_count = 0
        self._drift_estimate = 0.0
    
    def reset_for_rep(self):
        """Reset velocity state at start of new set (keep rep history)."""
        self.velocity = 0.0
        self.velocity_raw = 0.0
        self.kalman.reset(0.0)
        self._drift_estimate = 0.0


class VelocityEstimatorAdvanced:
    """
    Advanced velocity estimator using 2D Kalman filter.
    
    Tracks both position and velocity simultaneously,
    providing better drift rejection and smoother estimates.
    """
    
    def __init__(
        self,
        sample_rate_hz: float = 50.0,
        process_noise_accel: float = 0.5,
        measurement_noise: float = 0.1
    ):
        """
        Initialize advanced velocity estimator.
        
        Args:
            sample_rate_hz: IMU sample rate
            process_noise_accel: Expected acceleration noise (m/s²)
            measurement_noise: Measurement noise variance
        """
        self.dt = 1.0 / sample_rate_hz
        
        self.kalman = KalmanFilterVelocity(
            dt=self.dt,
            process_noise_accel=process_noise_accel,
            measurement_noise=measurement_noise
        )
        
        # State tracking
        self._current_time = 0.0
        self.velocity_history: List[float] = []
        self.position_history: List[float] = []
        
        # Rep tracking (same as basic estimator)
        self.in_rep = False
        self.rep_velocities: List[Dict[str, Any]] = []
        self._current_rep_velocities: List[float] = []
        self._rep_count = 0
    
    def update(
        self,
        a_lin_vertical: float,
        is_stable: bool = False,
        timestamp: Optional[float] = None
    ) -> Tuple[float, float]:
        """
        Update with new acceleration.
        
        Args:
            a_lin_vertical: Vertical linear acceleration (m/s²)
            is_stable: If True, applies ZUPT
            timestamp: Optional timestamp
        
        Returns:
            Tuple of (position, velocity)
        """
        if timestamp is not None:
            self._current_time = timestamp
        else:
            self._current_time += self.dt
        
        if is_stable:
            self.kalman.zupt()
            pos, vel = self.kalman.get_position(), self.kalman.get_velocity()
        else:
            pos, vel = self.kalman.update(a_lin_vertical)
        
        self.velocity_history.append(vel)
        self.position_history.append(pos)
        
        if self.in_rep:
            self._current_rep_velocities.append(vel)
        
        return (pos, vel)
    
    def get_velocity(self) -> float:
        return self.kalman.get_velocity()
    
    def get_position(self) -> float:
        return self.kalman.get_position()
    
    def reset(self):
        self.kalman.reset()
        self._current_time = 0.0
        self.velocity_history = []
        self.position_history = []
        self.in_rep = False
        self.rep_velocities = []
        self._current_rep_velocities = []
        self._rep_count = 0


if __name__ == "__main__":
    print("Testing VelocityEstimator:")
    
    estimator = VelocityEstimator(sample_rate_hz=50)
    
    # Simulate a simple lift: accelerate up, decelerate, stop
    print("\n1. Simulated rep (up then down):")
    
    # Phase 1: Accelerate up (0.5s at 2 m/s²)
    estimator.on_rep_start()
    for i in range(25):
        v = estimator.update(2.0)
    print(f"   After 0.5s acceleration: velocity = {v:.3f} m/s (expected: ~1.0)")
    
    # Phase 2: Constant velocity (0.3s at 0 m/s²)
    for i in range(15):
        v = estimator.update(0.0)
    print(f"   After 0.3s coast: velocity = {v:.3f} m/s (expected: ~1.0)")
    
    # Phase 3: Decelerate (0.5s at -2 m/s²)
    for i in range(25):
        v = estimator.update(-2.0)
    print(f"   After 0.5s deceleration: velocity = {v:.3f} m/s (expected: ~0.0)")
    
    # Phase 4: Stationary - apply ZUPT
    v = estimator.update(0.0, is_stable=True)
    print(f"   After ZUPT: velocity = {v:.3f} m/s (expected: 0.0)")
    
    # Complete rep
    metrics = estimator.on_rep_complete()
    print(f"\n   Rep metrics: {metrics}")
    
    # Test velocity loss calculation
    print("\n2. Testing velocity loss calculation:")
    estimator.reset()
    
    # Rep 1: peak velocity ~1.0 m/s
    estimator.on_rep_start()
    for i in range(25):
        estimator.update(2.0)
    for i in range(25):
        estimator.update(-2.0)
    estimator.update(0.0, is_stable=True)
    metrics1 = estimator.on_rep_complete()
    
    # Rep 2: peak velocity ~0.8 m/s (fatigue)
    estimator.on_rep_start()
    for i in range(25):
        estimator.update(1.6)
    for i in range(25):
        estimator.update(-1.6)
    estimator.update(0.0, is_stable=True)
    metrics2 = estimator.on_rep_complete()
    
    loss = estimator.get_velocity_loss_pct()
    print(f"   Rep 1 peak: {metrics1['peak_velocity']:.3f} m/s")
    print(f"   Rep 2 peak: {metrics2['peak_velocity']:.3f} m/s")
    print(f"   Velocity loss: {loss}%")
