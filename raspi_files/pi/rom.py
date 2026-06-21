"""
Range of Motion (ROM) estimation for LiftIQ.

Estimates vertical displacement (ROM) per rep by integrating velocity.
Provides consistency metrics to detect partial reps or form breakdown.
"""

import math
from typing import List, Optional, Dict, Any


class ROMEstimator:
    """
    Estimate range of motion (displacement) per rep.
    
    ROM is computed by integrating velocity over the rep duration.
    Provides per-rep ROM and consistency analysis across the set.
    
    Usage:
        rom = ROMEstimator(sample_rate_hz=50)
        rom.on_rep_start()
        displacement = rom.update(velocity)  # call each sample
        rep_rom = rom.on_rep_complete()
    """
    
    def __init__(self, sample_rate_hz: float = 50.0):
        """
        Initialize ROM estimator.
        
        Args:
            sample_rate_hz: IMU sample rate
        """
        self.dt = 1.0 / sample_rate_hz
        
        # Position state
        self.position = 0.0
        self.rep_start_position = 0.0
        
        # Per-rep tracking
        self.rom_per_rep: List[float] = []
        self._current_rep_positions: List[float] = []
        self._current_rep_min = 0.0
        self._current_rep_max = 0.0
        
        # History
        self.position_history: List[float] = []
        self._current_time = 0.0
    
    def update(self, velocity: float, timestamp: Optional[float] = None) -> float:
        """
        Update position by integrating velocity.
        
        Args:
            velocity: Current velocity (m/s)
            timestamp: Optional timestamp
        
        Returns:
            Displacement relative to rep start (meters)
        """
        if timestamp is not None:
            self._current_time = timestamp
        else:
            self._current_time += self.dt
        
        self.position += velocity * self.dt
        self.position_history.append(self.position)
        
        self._current_rep_positions.append(self.position)
        self._current_rep_min = min(self._current_rep_min, self.position)
        self._current_rep_max = max(self._current_rep_max, self.position)
        
        return self.position - self.rep_start_position
    
    def on_rep_start(self):
        """Reset baseline at start of rep."""
        self.rep_start_position = self.position
        self._current_rep_positions = [self.position]
        self._current_rep_min = self.position
        self._current_rep_max = self.position
    
    def on_rep_complete(self) -> float:
        """
        Complete rep and return ROM.
        
        Returns:
            ROM for this rep in meters
        """
        rom = self._current_rep_max - self._current_rep_min
        self.rom_per_rep.append(rom)
        return rom
    
    def get_average_rom(self) -> Optional[float]:
        """Average ROM across all reps."""
        if not self.rom_per_rep:
            return None
        return sum(self.rom_per_rep) / len(self.rom_per_rep)
    
    def get_rom_consistency_pct(self) -> Optional[float]:
        """
        ROM consistency as coefficient of variation (lower = more consistent).
        
        Returns:
            CV percentage, or None if < 2 reps
        """
        if len(self.rom_per_rep) < 2:
            return None
        
        mean_rom = sum(self.rom_per_rep) / len(self.rom_per_rep)
        if mean_rom <= 0:
            return None
        
        variance = sum((r - mean_rom)**2 for r in self.rom_per_rep) / len(self.rom_per_rep)
        std_dev = math.sqrt(variance)
        
        cv = (std_dev / mean_rom) * 100.0
        return round(cv, 2)
    
    def get_rom_loss_pct(self) -> Optional[float]:
        """
        ROM reduction from first to last rep.
        
        Returns:
            Percentage drop (0-100), or None if < 2 reps
        """
        if len(self.rom_per_rep) < 2:
            return None
        
        first = self.rom_per_rep[0]
        last = self.rom_per_rep[-1]
        
        if first <= 0:
            return None
        
        loss = (1.0 - last / first) * 100.0
        return round(max(0.0, min(100.0, loss)), 2)
    
    def get_current_displacement(self) -> float:
        """Current displacement from rep start."""
        return self.position - self.rep_start_position
    
    def get_rep_rom_values(self) -> List[float]:
        """Get ROM for all completed reps."""
        return self.rom_per_rep.copy()
    
    def is_partial_rep(self, threshold_pct: float = 70.0) -> bool:
        """
        Check if current rep is partial (< threshold% of average).
        
        Args:
            threshold_pct: Minimum ROM as percentage of average
        
        Returns:
            True if current rep ROM is below threshold
        """
        avg = self.get_average_rom()
        if avg is None or avg <= 0:
            return False
        
        current = self._current_rep_max - self._current_rep_min
        return (current / avg * 100.0) < threshold_pct
    
    def reset(self):
        """Reset all state for new session."""
        self.position = 0.0
        self.rep_start_position = 0.0
        self.rom_per_rep = []
        self._current_rep_positions = []
        self._current_rep_min = 0.0
        self._current_rep_max = 0.0
        self.position_history = []
        self._current_time = 0.0
    
    def zupt(self):
        """Zero-position update (optional drift correction)."""
        pass  # Position drift is handled by velocity ZUPT


def meters_to_cm(meters: float) -> float:
    """Convert meters to centimeters."""
    return meters * 100.0


def meters_to_inches(meters: float) -> float:
    """Convert meters to inches."""
    return meters * 39.3701


if __name__ == "__main__":
    print("Testing ROMEstimator:")
    
    rom = ROMEstimator(sample_rate_hz=50)
    
    # Simulate a squat rep (roughly 0.5m ROM)
    print("\n1. Simulated squat rep:")
    
    rom.on_rep_start()
    
    # Going down (negative velocity for 0.5s)
    for i in range(25):
        rom.update(-1.0)  # -1 m/s for 0.5s = -0.5m
    
    # At bottom
    for i in range(10):
        rom.update(0.0)
    
    # Coming up (positive velocity)
    for i in range(25):
        rom.update(1.0)  # +1 m/s for 0.5s = +0.5m
    
    rep_rom = rom.on_rep_complete()
    print(f"   Rep 1 ROM: {rep_rom:.3f} m ({meters_to_cm(rep_rom):.1f} cm)")
    
    # Second rep (slightly less ROM - fatigue)
    rom.on_rep_start()
    for i in range(23):
        rom.update(-1.0)
    for i in range(10):
        rom.update(0.0)
    for i in range(23):
        rom.update(1.0)
    rep_rom = rom.on_rep_complete()
    print(f"   Rep 2 ROM: {rep_rom:.3f} m ({meters_to_cm(rep_rom):.1f} cm)")
    
    print(f"\n   Average ROM: {rom.get_average_rom():.3f} m")
    print(f"   ROM loss: {rom.get_rom_loss_pct()}%")
    print(f"   Consistency (CV): {rom.get_rom_consistency_pct()}%")
