let magnitudeBuffer = [];
let movingAverage = 0;
let lastRepTime = 0;
let isPeakDetected = false;

// Configuration
const BUFFER_SIZE = 5;
const PEAK_THRESHOLD = 12.0;
const VALLEY_THRESHOLD = 9.5;
const DEBOUNCE_TIME = 800;

export function resetRepDetector() {
  magnitudeBuffer = [];
  movingAverage = 0;
  lastRepTime = 0;
  isPeakDetected = false;
}

export function detectRep(magnitude) {
  const now = Date.now();
  
  // Add to buffer
  magnitudeBuffer.push(magnitude);
  if (magnitudeBuffer.length > BUFFER_SIZE) {
    magnitudeBuffer.shift();
  }
  
  // Calculate moving average
  movingAverage = magnitudeBuffer.reduce((a, b) => a + b, 0) / magnitudeBuffer.length;
  
  // Need full buffer before detecting
  if (magnitudeBuffer.length < BUFFER_SIZE) {
    return false;
  }
  
  // Debounce check
  if (now - lastRepTime < DEBOUNCE_TIME) {
    return false;
  }
  
  // Peak detection logic
  // Looking for a peak (high acceleration) followed by valley (low acceleration)
  
  if (!isPeakDetected && movingAverage > PEAK_THRESHOLD) {
    // Detected peak (lift phase)
    isPeakDetected = true;
    return false;
  }
  
  if (isPeakDetected && movingAverage < VALLEY_THRESHOLD) {
    // Detected valley after peak (lowering phase) = complete rep
    isPeakDetected = false;
    lastRepTime = now;
    return true;
  }
  
  return false;
}

export function getCurrentMovingAverage() {
  return movingAverage;
}