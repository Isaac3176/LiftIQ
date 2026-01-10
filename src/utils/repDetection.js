// src/utils/repDetection.js - IMPROVED VERSION

// State machine states
const States = {
  CALIBRATING: 'CALIBRATING',
  WAITING: 'WAITING',
  MOVING: 'MOVING',
};

// Detection state
let state = States.CALIBRATING;
let filteredMagnitude = 0;
let repCount = 0;
let lastRepTime = 0;
let samplesInMotion = 0;
let calibrationSamples = [];
let baseline = 0;
let noiseStdDev = 0;

// Adaptive thresholds
let enterMovingThreshold = 0;
let exitMovingThreshold = 0;

// Configuration
const CONFIG = {
  // EMA filter coefficient (0-1, lower = more smoothing)
  ALPHA: 0.15,
  
  // Calibration
  CALIBRATION_DURATION_MS: 2000,
  CALIBRATION_SAMPLES_NEEDED: 100,
  THRESHOLD_MULTIPLIER: 3.0, // baseline + k * stdDev
  
  // Hysteresis (prevent flickering)
  HYSTERESIS_FACTOR: 0.8, // exit threshold = enter * this
  
  // Motion validation
  MIN_MOTION_SAMPLES: 3, // Must be above threshold for N samples
  DEBOUNCE_TIME_MS: 800, // Minimum time between reps
  
  // Confidence scoring
  MIN_CONFIDENCE: 0.6,
};

// Calculate standard deviation
function calculateStdDev(values, mean) {
  const squareDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

// Calibrate thresholds based on initial noise
function calibrate() {
  if (calibrationSamples.length < CONFIG.CALIBRATION_SAMPLES_NEEDED) {
    return false; // Not enough samples yet
  }

  baseline = calibrationSamples.reduce((a, b) => a + b, 0) / calibrationSamples.length;
  noiseStdDev = calculateStdDev(calibrationSamples, baseline);
  
  enterMovingThreshold = baseline + CONFIG.THRESHOLD_MULTIPLIER * noiseStdDev;
  exitMovingThreshold = enterMovingThreshold * CONFIG.HYSTERESIS_FACTOR;
  
  console.log(`Calibration complete: baseline=${baseline.toFixed(2)}, ` +
              `stdDev=${noiseStdDev.toFixed(2)}, ` +
              `enterThreshold=${enterMovingThreshold.toFixed(2)}, ` +
              `exitThreshold=${exitMovingThreshold.toFixed(2)}`);
  
  state = States.WAITING;
  calibrationSamples = []; // Free memory
  return true;
}

// Main detection function
export function detectRep(ax, ay, az, gx, gy, gz) {
  const now = Date.now();
  
  // Calculate gyro magnitude (more stable than accel for reps)
  const gyroMag = Math.sqrt(gx * gx + gy * gy + gz * gz);
  
  // Apply EMA filter
  if (filteredMagnitude === 0) {
    filteredMagnitude = gyroMag; // Initialize
  } else {
    filteredMagnitude = CONFIG.ALPHA * gyroMag + (1 - CONFIG.ALPHA) * filteredMagnitude;
  }
  
  // State machine
  switch (state) {
    case States.CALIBRATING:
      calibrationSamples.push(filteredMagnitude);
      calibrate(); // Will transition to WAITING when ready
      return {
        repDetected: false,
        phase: 'calibrating',
        confidence: 0,
        reps: repCount,
        state: state,
        filtered: filteredMagnitude,
      };
    
    case States.WAITING:
      // Check if motion started
      if (filteredMagnitude > enterMovingThreshold) {
        samplesInMotion++;
        
        // Require sustained motion before accepting
        if (samplesInMotion >= CONFIG.MIN_MOTION_SAMPLES) {
          state = States.MOVING;
          samplesInMotion = 0;
        }
      } else {
        samplesInMotion = 0; // Reset counter if drops below
      }
      
      return {
        repDetected: false,
        phase: 'waiting',
        confidence: 0,
        reps: repCount,
        state: state,
        filtered: filteredMagnitude,
      };
    
    case States.MOVING:
      // Check if motion ended (rep completed)
      if (filteredMagnitude < exitMovingThreshold) {
        // Check debounce time
        if (now - lastRepTime < CONFIG.DEBOUNCE_TIME_MS) {
          // Too soon, ignore
          return {
            repDetected: false,
            phase: 'moving',
            confidence: 0,
            reps: repCount,
            state: state,
            filtered: filteredMagnitude,
          };
        }
        
        // Calculate confidence based on signal quality
        const signalStrength = filteredMagnitude / baseline;
        const confidence = Math.min(1.0, Math.max(0, 1 - (1 / signalStrength)));
        
        if (confidence >= CONFIG.MIN_CONFIDENCE) {
          // Valid rep!
          repCount++;
          lastRepTime = now;
          state = States.WAITING;
          
          return {
            repDetected: true,
            phase: 'completed',
            confidence: confidence,
            reps: repCount,
            state: state,
            filtered: filteredMagnitude,
          };
        } else {
          // Low confidence, reject
          state = States.WAITING;
          return {
            repDetected: false,
            phase: 'rejected',
            confidence: confidence,
            reps: repCount,
            state: state,
            filtered: filteredMagnitude,
          };
        }
      }
      
      return {
        repDetected: false,
        phase: 'moving',
        confidence: 0,
        reps: repCount,
        state: state,
        filtered: filteredMagnitude,
      };
    
    default:
      return {
        repDetected: false,
        phase: 'unknown',
        confidence: 0,
        reps: repCount,
        state: state,
        filtered: filteredMagnitude,
      };
  }
}

// Reset detector
export function resetRepDetector() {
  state = States.CALIBRATING;
  filteredMagnitude = 0;
  repCount = 0;
  lastRepTime = 0;
  samplesInMotion = 0;
  calibrationSamples = [];
  baseline = 0;
  noiseStdDev = 0;
  enterMovingThreshold = 0;
  exitMovingThreshold = 0;
  
  console.log('Rep detector reset, entering calibration phase');
}

// Get current state for debugging
export function getDetectorState() {
  return {
    state,
    filteredMagnitude,
    repCount,
    baseline,
    noiseStdDev,
    enterMovingThreshold,
    exitMovingThreshold,
    calibrationProgress: calibrationSamples.length / CONFIG.CALIBRATION_SAMPLES_NEEDED,
  };
}

// Get current state for debugging
export function getDetectorState() {
  return {
    state,
    filteredMagnitude,
    repCount,
    baseline,
    noiseStdDev,
    enterMovingThreshold,
    exitMovingThreshold,
    calibrationProgress: calibrationSamples.length / CONFIG.CALIBRATION_SAMPLES_NEEDED,
  };
}

// Update configuration (for tuning)
export function updateConfig(newConfig) {
  Object.assign(CONFIG, newConfig);
  console.log('Rep detector config updated:', CONFIG);
}