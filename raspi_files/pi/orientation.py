"""
Orientation estimation for LiftIQ using Madgwick AHRS filter.

Fuses accelerometer and gyroscope data to estimate roll, pitch, and yaw
orientation of the barbell-mounted IMU sensor.

Reference: https://x-io.co.uk/open-source-imu-and-ahrs-algorithms/
"""

import math
from typing import Tuple, Optional


class OrientationFilter:
    """
    Madgwick AHRS (Attitude and Heading Reference System) filter.
    
    Estimates orientation (roll, pitch, yaw) by fusing:
    - Gyroscope: fast response, but drifts over time
    - Accelerometer: slow/noisy, but provides absolute gravity reference
    
    The filter uses gradient descent to find the orientation that best
    matches the accelerometer measurement while integrating gyro data.
    
    Usage:
        orientation = OrientationFilter(sample_rate_hz=50)
        roll, pitch, yaw = orientation.update(ax, ay, az, gx, gy, gz)
    """
    
    def __init__(
        self, 
        sample_rate_hz: float = 50.0, 
        beta: float = 0.1,
        initial_quaternion: Optional[Tuple[float, float, float, float]] = None
    ):
        """
        Initialize Madgwick filter.
        
        Args:
            sample_rate_hz: IMU sample rate in Hz
            beta: Filter gain (0.0 to 1.0)
                  - Higher beta = trust accelerometer more, converge faster
                  - Lower beta = trust gyroscope more, smoother but may drift
                  - Typical values: 0.033 (conservative) to 0.5 (aggressive)
                  - Recommended for weightlifting: 0.05 to 0.15
            initial_quaternion: Starting orientation as (w, x, y, z)
                               Default is identity (sensor aligned with world)
        """
        self.sample_period = 1.0 / sample_rate_hz
        self.beta = beta
        
        # Quaternion representing orientation
        # q = [w, x, y, z] where w is scalar part
        if initial_quaternion is not None:
            self.q = list(initial_quaternion)
        else:
            self.q = [1.0, 0.0, 0.0, 0.0]
        
        # For diagnostics
        self._last_accel_magnitude = 0.0
        self._gyro_integration_only = False
    
    def update(
        self, 
        ax: float, ay: float, az: float,
        gx: float, gy: float, gz: float,
        mx: Optional[float] = None, 
        my: Optional[float] = None, 
        mz: Optional[float] = None
    ) -> Tuple[float, float, float]:
        """
        Update orientation estimate with new sensor reading.
        
        Args:
            ax, ay, az: Accelerometer readings in m/s² (or g-units, will normalize)
            gx, gy, gz: Gyroscope readings in deg/s (converted internally to rad/s)
            mx, my, mz: Magnetometer readings (optional, for yaw correction)
                        Currently not implemented - yaw will drift without mag
        
        Returns:
            Tuple of (roll, pitch, yaw) in degrees
            - roll: rotation about X-axis (-180 to +180)
            - pitch: rotation about Y-axis (-90 to +90)
            - yaw: rotation about Z-axis (-180 to +180)
        """
        q0, q1, q2, q3 = self.q
        
        # Convert gyro from deg/s to rad/s
        gx_rad = gx * math.pi / 180.0
        gy_rad = gy * math.pi / 180.0
        gz_rad = gz * math.pi / 180.0
        
        # Rate of change of quaternion from gyroscope
        qDot1 = 0.5 * (-q1 * gx_rad - q2 * gy_rad - q3 * gz_rad)
        qDot2 = 0.5 * (q0 * gx_rad + q2 * gz_rad - q3 * gy_rad)
        qDot3 = 0.5 * (q0 * gy_rad - q1 * gz_rad + q3 * gx_rad)
        qDot4 = 0.5 * (q0 * gz_rad + q1 * gy_rad - q2 * gx_rad)
        
        # Normalize accelerometer measurement
        accel_norm = math.sqrt(ax*ax + ay*ay + az*az)
        self._last_accel_magnitude = accel_norm
        
        # Only use accelerometer correction if magnitude is reasonable
        # (between 0.5g and 2g to avoid corruption during high-accel movements)
        if 4.9 < accel_norm < 19.6:  # Roughly 0.5g to 2g in m/s²
            ax_n = ax / accel_norm
            ay_n = ay / accel_norm
            az_n = az / accel_norm
            
            # Auxiliary variables to avoid repeated calculations
            _2q0 = 2.0 * q0
            _2q1 = 2.0 * q1
            _2q2 = 2.0 * q2
            _2q3 = 2.0 * q3
            _4q0 = 4.0 * q0
            _4q1 = 4.0 * q1
            _4q2 = 4.0 * q2
            _8q1 = 8.0 * q1
            _8q2 = 8.0 * q2
            q0q0 = q0 * q0
            q1q1 = q1 * q1
            q2q2 = q2 * q2
            q3q3 = q3 * q3
            
            # Gradient descent algorithm corrective step
            # Objective function: rotate gravity vector to match accelerometer
            s0 = _4q0 * q2q2 + _2q2 * ax_n + _4q0 * q1q1 - _2q1 * ay_n
            s1 = _4q1 * q3q3 - _2q3 * ax_n + 4.0 * q0q0 * q1 - _2q0 * ay_n - _4q1 + _8q1 * q1q1 + _8q1 * q2q2 + _4q1 * az_n
            s2 = 4.0 * q0q0 * q2 + _2q0 * ax_n + _4q2 * q3q3 - _2q3 * ay_n - _4q2 + _8q2 * q1q1 + _8q2 * q2q2 + _4q2 * az_n
            s3 = 4.0 * q1q1 * q3 - _2q1 * ax_n + 4.0 * q2q2 * q3 - _2q2 * ay_n
            
            # Normalize step magnitude
            s_norm = math.sqrt(s0*s0 + s1*s1 + s2*s2 + s3*s3)
            if s_norm > 0:
                s0 /= s_norm
                s1 /= s_norm
                s2 /= s_norm
                s3 /= s_norm
            
            # Apply feedback step
            qDot1 -= self.beta * s0
            qDot2 -= self.beta * s1
            qDot3 -= self.beta * s2
            qDot4 -= self.beta * s3
            
            self._gyro_integration_only = False
        else:
            # High acceleration - use gyro only
            self._gyro_integration_only = True
        
        # Integrate rate of change to get quaternion
        q0 += qDot1 * self.sample_period
        q1 += qDot2 * self.sample_period
        q2 += qDot3 * self.sample_period
        q3 += qDot4 * self.sample_period
        
        # Normalize quaternion
        q_norm = math.sqrt(q0*q0 + q1*q1 + q2*q2 + q3*q3)
        self.q = [q0/q_norm, q1/q_norm, q2/q_norm, q3/q_norm]
        
        return self.get_euler_angles()
    
    def update_imu_only(
        self, 
        ax: float, ay: float, az: float,
        gx: float, gy: float, gz: float
    ) -> Tuple[float, float, float]:
        """
        Alias for update() without magnetometer.
        """
        return self.update(ax, ay, az, gx, gy, gz)
    
    def get_euler_angles(self) -> Tuple[float, float, float]:
        """
        Convert current quaternion to Euler angles.
        
        Returns:
            Tuple of (roll, pitch, yaw) in degrees
        """
        q0, q1, q2, q3 = self.q
        
        # Roll (x-axis rotation)
        sinr_cosp = 2.0 * (q0 * q1 + q2 * q3)
        cosr_cosp = 1.0 - 2.0 * (q1 * q1 + q2 * q2)
        roll = math.atan2(sinr_cosp, cosr_cosp)
        
        # Pitch (y-axis rotation)
        sinp = 2.0 * (q0 * q2 - q3 * q1)
        if abs(sinp) >= 1:
            pitch = math.copysign(math.pi / 2, sinp)  # Use 90 degrees if out of range
        else:
            pitch = math.asin(sinp)
        
        # Yaw (z-axis rotation)
        siny_cosp = 2.0 * (q0 * q3 + q1 * q2)
        cosy_cosp = 1.0 - 2.0 * (q2 * q2 + q3 * q3)
        yaw = math.atan2(siny_cosp, cosy_cosp)
        
        # Convert to degrees
        return (
            roll * 180.0 / math.pi,
            pitch * 180.0 / math.pi,
            yaw * 180.0 / math.pi
        )
    
    def get_quaternion(self) -> Tuple[float, float, float, float]:
        """Return current quaternion (w, x, y, z)."""
        return tuple(self.q)
    
    def get_rotation_matrix(self) -> list:
        """
        Get 3x3 rotation matrix from quaternion.
        
        Returns:
            3x3 rotation matrix as list of lists
        """
        q0, q1, q2, q3 = self.q
        
        # First row
        r00 = 1 - 2*(q2*q2 + q3*q3)
        r01 = 2*(q1*q2 - q0*q3)
        r02 = 2*(q1*q3 + q0*q2)
        
        # Second row
        r10 = 2*(q1*q2 + q0*q3)
        r11 = 1 - 2*(q1*q1 + q3*q3)
        r12 = 2*(q2*q3 - q0*q1)
        
        # Third row
        r20 = 2*(q1*q3 - q0*q2)
        r21 = 2*(q2*q3 + q0*q1)
        r22 = 1 - 2*(q1*q1 + q2*q2)
        
        return [[r00, r01, r02],
                [r10, r11, r12],
                [r20, r21, r22]]
    
    def reset(self, quaternion: Optional[Tuple[float, float, float, float]] = None):
        """
        Reset orientation to identity or specified quaternion.
        
        Args:
            quaternion: Optional (w, x, y, z) to reset to
        """
        if quaternion is not None:
            self.q = list(quaternion)
        else:
            self.q = [1.0, 0.0, 0.0, 0.0]
    
    def set_beta(self, beta: float):
        """Adjust filter gain (useful for tuning during operation)."""
        self.beta = max(0.0, min(1.0, beta))
    
    def is_gyro_only_mode(self) -> bool:
        """Check if last update used gyro-only (high acceleration detected)."""
        return self._gyro_integration_only


class ComplementaryFilter:
    """
    Simple complementary filter alternative to Madgwick.
    
    Easier to understand and tune, but less accurate.
    Good for testing or when computational resources are very limited.
    
    Usage:
        cf = ComplementaryFilter(sample_rate_hz=50, alpha=0.98)
        roll, pitch, yaw = cf.update(ax, ay, az, gx, gy, gz)
    """
    
    def __init__(self, sample_rate_hz: float = 50.0, alpha: float = 0.98):
        """
        Initialize complementary filter.
        
        Args:
            sample_rate_hz: IMU sample rate
            alpha: Filter coefficient (0.9 to 0.99)
                   Higher = trust gyro more (smoother but may drift)
                   Lower = trust accelerometer more (noisier but stable)
        """
        self.dt = 1.0 / sample_rate_hz
        self.alpha = alpha
        
        self.roll = 0.0
        self.pitch = 0.0
        self.yaw = 0.0  # Note: will drift without magnetometer
    
    def update(
        self, 
        ax: float, ay: float, az: float,
        gx: float, gy: float, gz: float
    ) -> Tuple[float, float, float]:
        """
        Update orientation estimate.
        
        Args:
            ax, ay, az: Accelerometer (m/s² or g-units)
            gx, gy, gz: Gyroscope (deg/s)
        
        Returns:
            (roll, pitch, yaw) in degrees
        """
        # Accelerometer-based angles
        accel_roll = math.atan2(ay, az) * 180.0 / math.pi
        accel_pitch = math.atan2(-ax, math.sqrt(ay*ay + az*az)) * 180.0 / math.pi
        
        # Gyroscope integration
        self.roll += gx * self.dt
        self.pitch += gy * self.dt
        self.yaw += gz * self.dt
        
        # Complementary filter fusion
        self.roll = self.alpha * self.roll + (1 - self.alpha) * accel_roll
        self.pitch = self.alpha * self.pitch + (1 - self.alpha) * accel_pitch
        # Yaw has no accelerometer reference, so it will drift
        
        return (self.roll, self.pitch, self.yaw)
    
    def reset(self):
        """Reset angles to zero."""
        self.roll = 0.0
        self.pitch = 0.0
        self.yaw = 0.0
    
    def get_euler_angles(self) -> Tuple[float, float, float]:
        """Return current (roll, pitch, yaw) in degrees."""
        return (self.roll, self.pitch, self.yaw)


if __name__ == "__main__":
    import time
    
    # Test Madgwick filter with simulated data
    print("Testing OrientationFilter (Madgwick):")
    
    orientation = OrientationFilter(sample_rate_hz=50, beta=0.1)
    
    # Simulate sensor at rest (gravity along Z)
    # Accelerometer: 0, 0, 9.81 m/s²
    # Gyroscope: 0, 0, 0 deg/s
    print("\n1. Sensor at rest (flat):")
    for i in range(50):
        roll, pitch, yaw = orientation.update(0.0, 0.0, 9.81, 0.0, 0.0, 0.0)
    print(f"   Roll: {roll:.2f}°, Pitch: {pitch:.2f}°, Yaw: {yaw:.2f}°")
    print(f"   Expected: Roll ≈ 0°, Pitch ≈ 0°, Yaw ≈ 0°")
    
    # Simulate 45-degree tilt about X-axis (roll)
    print("\n2. Tilted 45° roll:")
    orientation.reset()
    ax, ay, az = 0.0, 6.94, 6.94  # 9.81 * sin(45), 9.81 * cos(45)
    for i in range(100):
        roll, pitch, yaw = orientation.update(ax, ay, az, 0.0, 0.0, 0.0)
    print(f"   Roll: {roll:.2f}°, Pitch: {pitch:.2f}°, Yaw: {yaw:.2f}°")
    print(f"   Expected: Roll ≈ 45°, Pitch ≈ 0°")
    
    # Test complementary filter
    print("\n3. Testing ComplementaryFilter:")
    cf = ComplementaryFilter(sample_rate_hz=50, alpha=0.98)
    for i in range(100):
        roll, pitch, yaw = cf.update(ax, ay, az, 0.0, 0.0, 0.0)
    print(f"   Roll: {roll:.2f}°, Pitch: {pitch:.2f}°, Yaw: {yaw:.2f}°")
