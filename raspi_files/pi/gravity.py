"""
Gravity removal for LiftIQ.

Removes the gravity component from accelerometer readings to obtain
linear (motion-only) acceleration, which is needed for velocity integration.

The gravity vector in the sensor frame depends on the sensor's orientation.
We use the orientation estimate to compute and subtract gravity.
"""

import math
from typing import Tuple, List, Optional


class GravityRemover:
    """
    Remove gravity component from accelerometer to get linear acceleration.
    
    Uses orientation (from Madgwick filter) to determine gravity direction
    in sensor frame, then subtracts it from raw accelerometer readings.
    
    Usage:
        remover = GravityRemover()
        a_lin_x, a_lin_y, a_lin_z = remover.remove_gravity(ax, ay, az, roll, pitch, yaw)
    """
    
    GRAVITY = 9.81  # m/s²
    
    def __init__(self, gravity: float = 9.81):
        """
        Initialize gravity remover.
        
        Args:
            gravity: Local gravity magnitude (default 9.81 m/s²)
                     Can adjust for altitude if needed (typically ±0.03 m/s²)
        """
        self.gravity = gravity
        
        # Cache for diagnostics
        self._last_gravity_vector = (0.0, 0.0, self.gravity)
        self._last_linear_accel = (0.0, 0.0, 0.0)
    
    def remove_gravity(
        self, 
        ax: float, ay: float, az: float,
        roll: float, pitch: float, yaw: float
    ) -> Tuple[float, float, float]:
        """
        Compute linear acceleration by removing gravity vector.
        
        The gravity vector in world frame is [0, 0, g].
        We rotate this into sensor frame using roll/pitch/yaw,
        then subtract from raw accelerometer reading.
        
        Args:
            ax, ay, az: Raw accelerometer readings (m/s²)
            roll, pitch, yaw: Current orientation (degrees)
        
        Returns:
            Tuple of (a_lin_x, a_lin_y, a_lin_z) - linear acceleration in m/s²
        """
        # Convert angles to radians
        roll_rad = roll * math.pi / 180.0
        pitch_rad = pitch * math.pi / 180.0
        # yaw_rad = yaw * math.pi / 180.0  # Not needed for gravity
        
        # Compute gravity vector in sensor frame
        # Using aerospace rotation sequence (ZYX): yaw -> pitch -> roll
        # Gravity in world frame: [0, 0, g]
        # After rotation to sensor frame:
        g_x = self.gravity * math.sin(pitch_rad)
        g_y = -self.gravity * math.sin(roll_rad) * math.cos(pitch_rad)
        g_z = self.gravity * math.cos(roll_rad) * math.cos(pitch_rad)
        
        self._last_gravity_vector = (g_x, g_y, g_z)
        
        # Subtract gravity to get linear acceleration
        a_lin_x = ax - g_x
        a_lin_y = ay - g_y
        a_lin_z = az - g_z
        
        self._last_linear_accel = (a_lin_x, a_lin_y, a_lin_z)
        
        return (a_lin_x, a_lin_y, a_lin_z)
    
    def remove_gravity_quaternion(
        self, 
        ax: float, ay: float, az: float,
        qw: float, qx: float, qy: float, qz: float
    ) -> Tuple[float, float, float]:
        """
        Remove gravity using quaternion orientation (more accurate).
        
        Args:
            ax, ay, az: Raw accelerometer (m/s²)
            qw, qx, qy, qz: Quaternion (w, x, y, z format)
        
        Returns:
            Tuple of (a_lin_x, a_lin_y, a_lin_z)
        """
        # Rotate world-frame gravity [0, 0, g] to sensor frame
        # Using quaternion rotation: v' = q* v q
        # For gravity along Z, this simplifies to:
        g_x = 2 * self.gravity * (qx*qz - qw*qy)
        g_y = 2 * self.gravity * (qw*qx + qy*qz)
        g_z = self.gravity * (qw*qw - qx*qx - qy*qy + qz*qz)
        
        self._last_gravity_vector = (g_x, g_y, g_z)
        
        a_lin_x = ax - g_x
        a_lin_y = ay - g_y
        a_lin_z = az - g_z
        
        self._last_linear_accel = (a_lin_x, a_lin_y, a_lin_z)
        
        return (a_lin_x, a_lin_y, a_lin_z)
    
    def get_gravity_vector(self) -> Tuple[float, float, float]:
        """Return last computed gravity vector in sensor frame."""
        return self._last_gravity_vector
    
    def get_linear_accel(self) -> Tuple[float, float, float]:
        """Return last computed linear acceleration."""
        return self._last_linear_accel
    
    def get_linear_accel_magnitude(self) -> float:
        """Return magnitude of last linear acceleration."""
        ax, ay, az = self._last_linear_accel
        return math.sqrt(ax*ax + ay*ay + az*az)


class AdaptiveGravityRemover:
    """
    Adaptive gravity removal with automatic calibration.
    
    Automatically estimates the gravity magnitude and sensor bias
    during periods of low motion (when the bar is stationary).
    """
    
    def __init__(
        self, 
        initial_gravity: float = 9.81,
        adaptation_rate: float = 0.01,
        motion_threshold: float = 0.5
    ):
        """
        Initialize adaptive gravity remover.
        
        Args:
            initial_gravity: Starting gravity estimate (m/s²)
            adaptation_rate: How quickly to adapt gravity/bias (0-1)
            motion_threshold: Threshold for detecting motion (m/s²)
        """
        self.gravity = initial_gravity
        self.alpha = adaptation_rate
        self.motion_threshold = motion_threshold
        
        # Bias estimation (accelerometer offset)
        self.bias_x = 0.0
        self.bias_y = 0.0
        self.bias_z = 0.0
        
        # For motion detection
        self._accel_history: List[Tuple[float, float, float]] = []
        self._history_size = 10
    
    def remove_gravity(
        self, 
        ax: float, ay: float, az: float,
        roll: float, pitch: float, yaw: float,
        is_stationary: bool = False
    ) -> Tuple[float, float, float]:
        """
        Remove gravity with optional stationary calibration.
        
        Args:
            ax, ay, az: Raw accelerometer (m/s²)
            roll, pitch, yaw: Orientation (degrees)
            is_stationary: If True, use this sample for calibration
        
        Returns:
            Linear acceleration (a_lin_x, a_lin_y, a_lin_z)
        """
        # Apply bias correction
        ax_corr = ax - self.bias_x
        ay_corr = ay - self.bias_y
        az_corr = az - self.bias_z
        
        # Update history for motion detection
        self._accel_history.append((ax_corr, ay_corr, az_corr))
        if len(self._accel_history) > self._history_size:
            self._accel_history.pop(0)
        
        # Auto-detect stationary if not specified
        if not is_stationary and len(self._accel_history) >= self._history_size:
            is_stationary = self._detect_stationary()
        
        # Calibrate during stationary periods
        if is_stationary:
            self._calibrate(ax, ay, az, roll, pitch)
        
        # Standard gravity removal
        roll_rad = roll * math.pi / 180.0
        pitch_rad = pitch * math.pi / 180.0
        
        g_x = self.gravity * math.sin(pitch_rad)
        g_y = -self.gravity * math.sin(roll_rad) * math.cos(pitch_rad)
        g_z = self.gravity * math.cos(roll_rad) * math.cos(pitch_rad)
        
        return (ax_corr - g_x, ay_corr - g_y, az_corr - g_z)
    
    def _detect_stationary(self) -> bool:
        """Detect if sensor is stationary based on accel variance."""
        if len(self._accel_history) < self._history_size:
            return False
        
        # Compute variance of acceleration magnitude
        mags = [math.sqrt(x*x + y*y + z*z) for x, y, z in self._accel_history]
        mean_mag = sum(mags) / len(mags)
        variance = sum((m - mean_mag)**2 for m in mags) / len(mags)
        
        return variance < self.motion_threshold ** 2
    
    def _calibrate(self, ax: float, ay: float, az: float, roll: float, pitch: float):
        """Update gravity and bias estimates during stationary period."""
        # Measured magnitude
        measured_g = math.sqrt(ax*ax + ay*ay + az*az)
        
        # Update gravity estimate
        self.gravity = (1 - self.alpha) * self.gravity + self.alpha * measured_g
        
        # Expected gravity direction based on orientation
        roll_rad = roll * math.pi / 180.0
        pitch_rad = pitch * math.pi / 180.0
        
        expected_ax = self.gravity * math.sin(pitch_rad)
        expected_ay = -self.gravity * math.sin(roll_rad) * math.cos(pitch_rad)
        expected_az = self.gravity * math.cos(roll_rad) * math.cos(pitch_rad)
        
        # Update bias as difference between measured and expected
        self.bias_x = (1 - self.alpha) * self.bias_x + self.alpha * (ax - expected_ax)
        self.bias_y = (1 - self.alpha) * self.bias_y + self.alpha * (ay - expected_ay)
        self.bias_z = (1 - self.alpha) * self.bias_z + self.alpha * (az - expected_az)
    
    def get_calibration(self) -> dict:
        """Return current calibration values."""
        return {
            "gravity": self.gravity,
            "bias_x": self.bias_x,
            "bias_y": self.bias_y,
            "bias_z": self.bias_z
        }
    
    def set_calibration(self, gravity: float, bias_x: float, bias_y: float, bias_z: float):
        """Set calibration values (e.g., loaded from file)."""
        self.gravity = gravity
        self.bias_x = bias_x
        self.bias_y = bias_y
        self.bias_z = bias_z


def rotate_to_world_frame(
    a_lin_x: float, a_lin_y: float, a_lin_z: float,
    roll: float, pitch: float, yaw: float
) -> Tuple[float, float, float]:
    """
    Rotate linear acceleration from sensor frame to world frame.
    
    Useful for getting vertical acceleration in world coordinates
    regardless of sensor orientation.
    
    Args:
        a_lin_x, a_lin_y, a_lin_z: Linear acceleration in sensor frame
        roll, pitch, yaw: Orientation (degrees)
    
    Returns:
        (a_world_x, a_world_y, a_world_z) - acceleration in world frame
    """
    # Convert to radians
    r = roll * math.pi / 180.0
    p = pitch * math.pi / 180.0
    y = yaw * math.pi / 180.0
    
    # Rotation matrix elements
    cr, sr = math.cos(r), math.sin(r)
    cp, sp = math.cos(p), math.sin(p)
    cy, sy = math.cos(y), math.sin(y)
    
    # Build rotation matrix (sensor to world)
    R = [
        [cy*cp, cy*sp*sr - sy*cr, cy*sp*cr + sy*sr],
        [sy*cp, sy*sp*sr + cy*cr, sy*sp*cr - cy*sr],
        [-sp,   cp*sr,            cp*cr           ]
    ]
    
    # Apply rotation
    a_world_x = R[0][0]*a_lin_x + R[0][1]*a_lin_y + R[0][2]*a_lin_z
    a_world_y = R[1][0]*a_lin_x + R[1][1]*a_lin_y + R[1][2]*a_lin_z
    a_world_z = R[2][0]*a_lin_x + R[2][1]*a_lin_y + R[2][2]*a_lin_z
    
    return (a_world_x, a_world_y, a_world_z)


if __name__ == "__main__":
    print("Testing GravityRemover:")
    
    remover = GravityRemover()
    
    # Test 1: Sensor flat (gravity along Z)
    print("\n1. Sensor flat (no tilt):")
    ax, ay, az = 0.0, 0.0, 9.81
    roll, pitch, yaw = 0.0, 0.0, 0.0
    lin = remover.remove_gravity(ax, ay, az, roll, pitch, yaw)
    print(f"   Raw accel: ({ax:.2f}, {ay:.2f}, {az:.2f})")
    print(f"   Linear accel: ({lin[0]:.3f}, {lin[1]:.3f}, {lin[2]:.3f})")
    print(f"   Expected: (0, 0, 0)")
    
    # Test 2: Sensor tilted 30° roll
    print("\n2. Sensor tilted 30° roll:")
    roll = 30.0
    # At 30° roll, gravity projects as:
    # g_y = -g * sin(30) = -4.905
    # g_z = g * cos(30) = 8.496
    ax, ay, az = 0.0, -4.905, 8.496
    lin = remover.remove_gravity(ax, ay, az, roll, 0.0, 0.0)
    print(f"   Raw accel: ({ax:.2f}, {ay:.2f}, {az:.2f})")
    print(f"   Linear accel: ({lin[0]:.3f}, {lin[1]:.3f}, {lin[2]:.3f})")
    print(f"   Expected: ≈ (0, 0, 0)")
    
    # Test 3: Moving upward with 1 m/s² while tilted
    print("\n3. Moving upward (+1 m/s² in world Z) while 30° roll:")
    # Raw accel = gravity_in_sensor + linear_accel_in_sensor
    ax, ay, az = 0.0, -4.905 - 0.5, 8.496 + 0.866  # +1 m/s² rotated to sensor
    lin = remover.remove_gravity(ax, ay, az, roll, 0.0, 0.0)
    print(f"   Raw accel: ({ax:.2f}, {ay:.2f}, {az:.2f})")
    print(f"   Linear accel: ({lin[0]:.3f}, {lin[1]:.3f}, {lin[2]:.3f})")
    mag = math.sqrt(lin[0]**2 + lin[1]**2 + lin[2]**2)
    print(f"   Magnitude: {mag:.3f} m/s² (expected: ≈1.0)")
