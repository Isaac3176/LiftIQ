import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system';

const CalibrationContext = createContext(null);
const STORAGE_PATH = `${FileSystem.documentDirectory || FileSystem.cacheDirectory}liftiq_calibrations.json`;
const KG_PER_LB = 0.453592;

const E1RM_VELOCITIES = {
  MIBP: 0.17,
  SMS: 0.3,
  deadlift: 0.15,
  squat: 0.3,
  bench: 0.17,
  OHP: 0.2,
  SBLP: 0.22,
  CGCR: 0.22,
  NGCR: 0.22,
  APULL: 0.22,
  DEFAULT: 0.2,
};

function toKg(load, unit) {
  const numeric = Number(load);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return unit === 'kg' ? numeric : numeric * KG_PER_LB;
}

function toUnit(kg, unit) {
  if (!Number.isFinite(kg)) return null;
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

function normalizeExerciseCode(exercise) {
  if (!exercise || typeof exercise !== 'string') return null;
  return exercise.trim();
}

function getTargetVelocity(exerciseCode) {
  return E1RM_VELOCITIES[exerciseCode] || E1RM_VELOCITIES.DEFAULT;
}

export function CalibrationProvider({ children }) {
  const [calibrations, setCalibrations] = useState({});
  const [isLoaded, setIsLoaded] = useState(false);
  const calibrationsRef = useRef({});

  useEffect(() => {
    calibrationsRef.current = calibrations;
  }, [calibrations]);

  useEffect(() => {
    loadCalibrations();
  }, []);

  const loadCalibrations = async () => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(STORAGE_PATH);
      if (!fileInfo.exists) {
        setIsLoaded(true);
        return;
      }
      const raw = await FileSystem.readAsStringAsync(STORAGE_PATH);
      const parsed = raw ? JSON.parse(raw) : {};
      setCalibrations(parsed || {});
      calibrationsRef.current = parsed || {};
    } catch (error) {
      console.error('Failed to load calibrations:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const persistCalibrations = async (next) => {
    try {
      await FileSystem.writeAsStringAsync(STORAGE_PATH, JSON.stringify(next));
    } catch (error) {
      console.error('Failed to save calibrations:', error);
    }
  };

  const addCalibrationPoint = (exercise, load, unit, velocity) => {
    const exerciseCode = normalizeExerciseCode(exercise);
    const loadKg = toKg(load, unit);
    const velocityValue = Number(velocity);
    if (!exerciseCode || !loadKg || !Number.isFinite(velocityValue) || velocityValue <= 0) {
      return null;
    }

    const point = {
      load: Number(load),
      loadKg: parseFloat(loadKg.toFixed(3)),
      velocity: parseFloat(velocityValue.toFixed(4)),
      unit: unit === 'kg' ? 'kg' : 'lb',
      timestamp: Date.now(),
    };

    const previous = calibrationsRef.current[exerciseCode] || {
      exercise: exerciseCode,
      dataPoints: [],
      slope: null,
      intercept: null,
      rSquared: null,
      targetVelocity: getTargetVelocity(exerciseCode),
      estimatedE1RM: null,
      estimatedE1RMLb: null,
      calibrationCount: 0,
      lastCalibrated: null,
    };

    const dataPoints = [...previous.dataPoints, point].slice(-10);
    let regression = { slope: null, intercept: null, rSquared: null };
    let estimatedE1RM = null;

    if (dataPoints.length >= 2) {
      regression = linearRegression(
        dataPoints.map((entry) => entry.loadKg),
        dataPoints.map((entry) => entry.velocity)
      );
      if (Number.isFinite(regression.slope) && regression.slope < 0) {
        estimatedE1RM = calculateE1RM(regression.slope, regression.intercept, getTargetVelocity(exerciseCode));
      }
    }

    const updated = {
      ...previous,
      exercise: exerciseCode,
      dataPoints,
      slope: regression.slope,
      intercept: regression.intercept,
      rSquared: regression.rSquared,
      targetVelocity: getTargetVelocity(exerciseCode),
      estimatedE1RM,
      estimatedE1RMLb: Number.isFinite(estimatedE1RM) ? Math.round(toUnit(estimatedE1RM, 'lb')) : null,
      calibrationCount: dataPoints.length,
      lastCalibrated: Date.now(),
    };

    const next = {
      ...calibrationsRef.current,
      [exerciseCode]: updated,
    };

    calibrationsRef.current = next;
    setCalibrations(next);
    persistCalibrations(next);
    return updated;
  };

  const getE1RM = (exercise, unit = 'lb') => {
    const exerciseCode = normalizeExerciseCode(exercise);
    if (!exerciseCode) return null;
    const cal = calibrations[exerciseCode];
    if (!cal || !Number.isFinite(cal.estimatedE1RM)) return null;

    const rawValue = toUnit(cal.estimatedE1RM, unit);
    if (!Number.isFinite(rawValue)) return null;

    return {
      e1rm: Math.round(rawValue),
      e1rmKg: Math.round(cal.estimatedE1RM),
      unit,
      confidence: cal.rSquared ?? 0,
      dataPoints: cal.calibrationCount ?? 0,
      lastCalibrated: cal.lastCalibrated,
      needsMoreData: (cal.calibrationCount ?? 0) < 3,
    };
  };

  const getCalibrationStatus = (exercise) => {
    const exerciseCode = normalizeExerciseCode(exercise);
    if (!exerciseCode) {
      return { status: 'uncalibrated', points: 0, message: 'No calibration data' };
    }

    const cal = calibrations[exerciseCode];
    if (!cal) {
      return { status: 'uncalibrated', points: 0, message: 'No calibration data' };
    }

    const points = cal.calibrationCount || 0;
    if (points < 2) return { status: 'insufficient', points, message: `Need ${2 - points} more set(s)` };
    if (points < 3) return { status: 'basic', points, message: 'Basic estimate available' };
    if (points < 5) return { status: 'good', points, message: 'Good estimate' };
    return { status: 'excellent', points, message: 'Well calibrated' };
  };

  const clearCalibration = async (exercise) => {
    const exerciseCode = normalizeExerciseCode(exercise);
    if (!exerciseCode) return;
    const next = { ...calibrationsRef.current };
    delete next[exerciseCode];
    calibrationsRef.current = next;
    setCalibrations(next);
    await persistCalibrations(next);
  };

  const clearAllCalibrations = async () => {
    calibrationsRef.current = {};
    setCalibrations({});
    try {
      const fileInfo = await FileSystem.getInfoAsync(STORAGE_PATH);
      if (fileInfo.exists) await FileSystem.deleteAsync(STORAGE_PATH);
    } catch (error) {
      console.error('Failed to clear calibrations:', error);
    }
  };

  const value = {
    calibrations,
    isLoaded,
    addCalibrationPoint,
    getE1RM,
    getCalibrationStatus,
    clearCalibration,
    clearAllCalibrations,
  };

  return <CalibrationContext.Provider value={value}>{children}</CalibrationContext.Provider>;
}

export function useCalibration() {
  const context = useContext(CalibrationContext);
  if (!context) {
    throw new Error('useCalibration must be used within CalibrationProvider');
  }
  return context;
}

function linearRegression(x, y) {
  const n = x.length;
  if (n < 2) return { slope: null, intercept: null, rSquared: null };

  const meanX = x.reduce((sum, value) => sum + value, 0) / n;
  const meanY = y.reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    numerator += (x[i] - meanX) * (y[i] - meanY);
    denominator += (x[i] - meanX) ** 2;
  }
  if (denominator === 0) return { slope: null, intercept: null, rSquared: null };

  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i += 1) {
    const predicted = slope * x[i] + intercept;
    ssRes += (y[i] - predicted) ** 2;
    ssTot += (y[i] - meanY) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return {
    slope: parseFloat(slope.toFixed(6)),
    intercept: parseFloat(intercept.toFixed(4)),
    rSquared: parseFloat(rSquared.toFixed(3)),
  };
}

function calculateE1RM(slope, intercept, targetVelocity) {
  if (!Number.isFinite(slope) || slope >= 0 || !Number.isFinite(intercept) || !Number.isFinite(targetVelocity)) return null;
  const e1rm = (targetVelocity - intercept) / slope;
  if (!Number.isFinite(e1rm) || e1rm <= 0 || e1rm > 1000) return null;
  return parseFloat(e1rm.toFixed(1));
}

export { linearRegression, calculateE1RM };
