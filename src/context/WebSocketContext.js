import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useCalibration } from './CalibrationContext';

const WebSocketContext = createContext(null);
const AUTO_LIFT_CONFIDENCE_MIN = 0.55;
const AUTO_LIFT_STABLE_HITS = 3;
const AUTO_LIFT_HOLD_MS = 2500;
const KG_PER_LB = 0.453592;

const FATIGUE_COLORS = {
  low: '#36D399',
  moderate: '#ffbc42',
  high: '#FF9800',
  very_high: '#ff5d73',
};

const DEFAULT_DETECTED_LIFT = {
  label: null,
  confidence: 0,
  isActive: false,
  isManual: false,
  status: 'idle',
};

const DEFAULT_LIVE_FATIGUE = {
  velocityLossPct: 0,
  fatigueLevel: 'low',
  fatigueMessage: 'Low fatigue',
  fatigueColor: FATIGUE_COLORS.low,
  recommendation: 'Build baseline with more reps',
  velocityLossMethod: 'none',
  firstRepsAvgVelocity: 0,
  lastRepsAvgVelocity: 0,
};

export function WebSocketProvider({ children }) {
  const { addCalibrationPoint } = useCalibration();
  const [websocket, setWebsocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastMessage, setLastMessage] = useState(null);
  const [repCount, setRepCount] = useState(0);
  const [currentState, setCurrentState] = useState('WAITING');
  const [isRecording, setIsRecording] = useState(false);
  const [gyroFilt, setGyroFilt] = useState(0);
  const [repEvents, setRepEvents] = useState([]);
  const [lastRepEvent, setLastRepEvent] = useState(null);
  const [currentSessionSummary, setCurrentSessionSummary] = useState(null);
  const [sessionWeight, setSessionWeight] = useState(null);
  const [sessionWeightUnit, setSessionWeightUnit] = useState('lb');
  const [currentSet, setCurrentSet] = useState(null);
  const [isSetActive, setIsSetActive] = useState(false);
  const [setHistory, setSetHistory] = useState([]);
  const [liveFatigue, setLiveFatigue] = useState(DEFAULT_LIVE_FATIGUE);

  const [detectedLift, setDetectedLift] = useState(DEFAULT_DETECTED_LIFT);
  const [piIp, setPiIp] = useState(null);

  const [sessionsList, setSessionsList] = useState(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSessionSummary, setSelectedSessionSummary] = useState(null);
  const [selectedSessionLoading, setSelectedSessionLoading] = useState(false);
  const [selectedSessionRawPoints, setSelectedSessionRawPoints] = useState(null);
  const [selectedSessionRawLoading, setSelectedSessionRawLoading] = useState(false);
  const [exportResult, setExportResult] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);

  const wsRef = useRef(null);
  const currentSetRef = useRef(null);
  const isSetActiveRef = useRef(false);
  const manualLiftRef = useRef(null);
  const autoLiftRef = useRef({
    candidate: null,
    candidateHits: 0,
    stableLabel: null,
    stableConfidence: 0,
    stableAt: 0,
  });

  const resetAutoLift = () => {
    autoLiftRef.current = {
      candidate: null,
      candidateHits: 0,
      stableLabel: null,
      stableConfidence: 0,
      stableAt: 0,
    };
  };

  const normalizeLiftLabel = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === 'unknown') return null;
    return trimmed;
  };

  const calculateVelocityLoss = (reps) => {
    if (!reps || reps.length === 0) {
      return { velocityLossPct: 0, vFirst: 0, vLast: 0, method: 'none' };
    }

    const velocities = reps
      .map((rep) => {
        const raw =
          rep?.meanConV ??
          rep?.mean_concentric_velocity_ms ??
          rep?.meanConcentricVelocityMs ??
          0;
        const value = Number(raw);
        return Number.isFinite(value) ? value : 0;
      })
      .filter((value) => value > 0);

    if (velocities.length === 0) {
      return { velocityLossPct: 0, vFirst: 0, vLast: 0, method: 'none' };
    }

    const n = velocities.length;
    let vFirst = 0;
    let vLast = 0;
    let method = 'none';

    if (n >= 6) {
      vFirst = (velocities[0] + velocities[1] + velocities[2]) / 3;
      vLast = (velocities[n - 3] + velocities[n - 2] + velocities[n - 1]) / 3;
      method = 'first3_last3';
    } else if (n >= 4) {
      vFirst = (velocities[0] + velocities[1]) / 2;
      vLast = (velocities[n - 2] + velocities[n - 1]) / 2;
      method = 'first2_last2';
    } else if (n >= 2) {
      vFirst = velocities[0];
      vLast = velocities[n - 1];
      method = 'first1_last1';
    } else {
      return {
        velocityLossPct: 0,
        vFirst: parseFloat(velocities[0].toFixed(3)),
        vLast: parseFloat(velocities[0].toFixed(3)),
        method: 'single_rep',
      };
    }

    const velocityLossPct = vFirst > 0 ? ((vFirst - vLast) / vFirst) * 100 : 0;

    return {
      velocityLossPct: parseFloat(Math.max(0, velocityLossPct).toFixed(1)),
      vFirst: parseFloat(vFirst.toFixed(3)),
      vLast: parseFloat(vLast.toFixed(3)),
      method,
    };
  };

  const getFatigueAssessment = (velocityLossPct) => {
    if (velocityLossPct < 10) {
      return {
        level: 'low',
        message: 'Low fatigue',
        recommendation: 'Plenty left in the tank',
        color: FATIGUE_COLORS.low,
      };
    }
    if (velocityLossPct < 20) {
      return {
        level: 'moderate',
        message: 'Moderate fatigue',
        recommendation: 'Good training stimulus',
        color: FATIGUE_COLORS.moderate,
      };
    }
    if (velocityLossPct < 30) {
      return {
        level: 'high',
        message: 'High fatigue',
        recommendation: 'Consider ending set',
        color: FATIGUE_COLORS.high,
      };
    }
    return {
      level: 'very_high',
      message: 'Very high fatigue',
      recommendation: 'Stop set - diminishing returns',
      color: FATIGUE_COLORS.very_high,
    };
  };

  useEffect(() => {
    currentSetRef.current = currentSet;
  }, [currentSet]);

  useEffect(() => {
    isSetActiveRef.current = isSetActive;
  }, [isSetActive]);

  useEffect(() => {
    if (!isSetActive || !currentSet?.reps?.length || currentSet.reps.length < 2) {
      setLiveFatigue(DEFAULT_LIVE_FATIGUE);
      return;
    }

    const velocityLossData = calculateVelocityLoss(currentSet.reps);
    const fatigueAssessment = getFatigueAssessment(velocityLossData.velocityLossPct);
    setLiveFatigue({
      velocityLossPct: velocityLossData.velocityLossPct,
      fatigueLevel: fatigueAssessment.level,
      fatigueMessage: fatigueAssessment.message,
      fatigueColor: fatigueAssessment.color,
      recommendation: fatigueAssessment.recommendation,
      velocityLossMethod: velocityLossData.method,
      firstRepsAvgVelocity: velocityLossData.vFirst,
      lastRepsAvgVelocity: velocityLossData.vLast,
    });
  }, [currentSet, isSetActive]);

  const computeSetSummary = (set) => {
    if (!set?.reps?.length) {
      return { totalReps: 0, duration: 0 };
    }

    const reps = set.reps;
    const n = reps.length;
    const avgPeakV = reps.reduce((sum, rep) => sum + rep.peakV, 0) / n;
    const avgMeanConV = reps.reduce((sum, rep) => sum + rep.meanConV, 0) / n;
    const avgRom = reps.reduce((sum, rep) => sum + rep.rom, 0) / n;
    const avgStability = reps.reduce((sum, rep) => sum + rep.stability, 0) / n;
    const avgTempo = reps.reduce((sum, rep) => sum + rep.tempo, 0) / n;

    const velocityLossData = calculateVelocityLoss(reps);
    const fatigueAssessment = getFatigueAssessment(velocityLossData.velocityLossPct);
    const romMean = avgRom;
    const romStd = Math.sqrt(reps.reduce((sum, rep) => sum + Math.pow(rep.rom - romMean, 2), 0) / n);
    const romConsistency = 100 - Math.min(100, romStd * 2);
    const bestRep = reps.reduce((best, rep) => (rep.peakV > best.peakV ? rep : best), reps[0]);
    const worstRep = reps.reduce((worst, rep) => (rep.peakV < worst.peakV ? rep : worst), reps[0]);

    return {
      totalReps: n,
      duration: set.endTime ? (set.endTime - set.startTime) / 1000 : 0,
      avgPeakVelocity: parseFloat(avgPeakV.toFixed(3)),
      avgMeanConcentricVelocity: parseFloat(avgMeanConV.toFixed(3)),
      avgRom: parseFloat(avgRom.toFixed(1)),
      avgStability: parseFloat(avgStability.toFixed(1)),
      avgTempo: parseFloat(avgTempo.toFixed(2)),
      velocityLossPct: velocityLossData.velocityLossPct,
      velocityLossMethod: velocityLossData.method,
      firstRepsAvgVelocity: velocityLossData.vFirst,
      lastRepsAvgVelocity: velocityLossData.vLast,
      fatigueLevel: fatigueAssessment.level,
      fatigueMessage: fatigueAssessment.message,
      fatigueRecommendation: fatigueAssessment.recommendation,
      fatigueColor: fatigueAssessment.color,
      romConsistency: parseFloat(romConsistency.toFixed(1)),
      bestRepNumber: bestRep.repNumber,
      bestRepVelocity: bestRep.peakV,
      worstRepNumber: worstRep.repNumber,
      worstRepVelocity: worstRep.peakV,
    };
  };

  const addRepToSet = (repData) => {
    if (!isSetActiveRef.current || !currentSetRef.current) return;

    setCurrentSet((prev) => {
      if (!prev) return prev;
      const repMetric = {
        repNumber: prev.reps.length + 1,
        peakV: repData.peak_velocity_ms || 0,
        meanConV: repData.mean_concentric_velocity_ms || 0,
        meanEccV: repData.mean_eccentric_velocity_ms || 0,
        rom: repData.rom_cm || 0,
        concTime: repData.concentric_time_sec || 0,
        eccTime: repData.eccentric_time_sec || 0,
        stability: repData.stability_score || 100,
        tempo: repData.tempo_sec || repData.rep_time || 0,
        ts: Date.now(),
      };
      const next = { ...prev, reps: [...prev.reps, repMetric] };
      currentSetRef.current = next;
      return next;
    });
  };

  const startSet = (config) => {
    if (!config?.exercise || !config?.weight) return null;

    const newSet = {
      id: `set_${Date.now()}`,
      exercise: config.exercise,
      weight: config.weight,
      weightUnit: config.weightUnit || 'lb',
      targetReps: config.targetReps || null,
      targetRPE: config.targetRPE || null,
      startTime: Date.now(),
      endTime: null,
      reps: [],
      summary: null,
    };

    setCurrentSet(newSet);
    currentSetRef.current = newSet;
    setSessionWeight(config.weight);
    setSessionWeightUnit(config.weightUnit || 'lb');
    setLiveFatigue(DEFAULT_LIVE_FATIGUE);
    setIsSetActive(true);
    isSetActiveRef.current = true;
    startRecording();
    return newSet;
  };

  const endSet = () => {
    const activeSet = currentSetRef.current;
    if (!activeSet) return null;

    const endedSet = {
      ...activeSet,
      endTime: Date.now(),
    };
    endedSet.summary = computeSetSummary(endedSet);

    const exerciseCode = endedSet.exercise?.code || null;
    const firstRepVelocity = endedSet.reps?.[0]?.meanConV || 0;
    const bestRepVelocity = endedSet.reps?.length
      ? Math.max(...endedSet.reps.map((rep) => Number(rep.meanConV) || 0))
      : 0;
    const calibrationVelocity = firstRepVelocity > 0 ? firstRepVelocity : bestRepVelocity;
    let e1rmData = null;

    if (exerciseCode && endedSet.weight && calibrationVelocity > 0) {
      const profile = addCalibrationPoint(exerciseCode, endedSet.weight, endedSet.weightUnit, calibrationVelocity);
      const e1rmKg = profile?.estimatedE1RM;
      if (Number.isFinite(e1rmKg)) {
        const unit = endedSet.weightUnit || 'lb';
        const e1rmValue = unit === 'kg' ? e1rmKg : e1rmKg / KG_PER_LB;
        e1rmData = {
          e1rm: Math.round(e1rmValue),
          e1rmKg: Math.round(e1rmKg),
          unit,
          confidence: profile?.rSquared ?? 0,
          dataPoints: profile?.calibrationCount ?? 0,
          lastCalibrated: profile?.lastCalibrated ?? Date.now(),
          needsMoreData: (profile?.calibrationCount ?? 0) < 3,
        };
      }
    }

    endedSet.e1rm = e1rmData;

    setCurrentSet(endedSet);
    currentSetRef.current = endedSet;
    setIsSetActive(false);
    isSetActiveRef.current = false;
    setLiveFatigue(DEFAULT_LIVE_FATIGUE);
    setSetHistory((prev) => [...prev, endedSet]);
    stopRecording();
    return endedSet;
  };

  const clearSetData = () => {
    setCurrentSet(null);
    currentSetRef.current = null;
    setIsSetActive(false);
    isSetActiveRef.current = false;
    setLiveFatigue(DEFAULT_LIVE_FATIGUE);
    setSetHistory([]);
  };

  const handleAutoDetectedLift = (rawLabel, rawConfidence) => {
    if (manualLiftRef.current) return;

    const label = normalizeLiftLabel(rawLabel);
    const confidence = Number(rawConfidence) || 0;
    const now = Date.now();
    const tracker = autoLiftRef.current;
    const hasStrongSignal = label && confidence >= AUTO_LIFT_CONFIDENCE_MIN;

    if (hasStrongSignal) {
      if (tracker.candidate === label) {
        tracker.candidateHits += 1;
      } else {
        tracker.candidate = label;
        tracker.candidateHits = 1;
      }

      if (tracker.candidateHits >= AUTO_LIFT_STABLE_HITS) {
        tracker.stableLabel = label;
        tracker.stableConfidence = confidence;
        tracker.stableAt = now;
        setDetectedLift({
          label,
          confidence,
          isActive: true,
          isManual: false,
          status: 'stable',
        });
        return;
      }

      setDetectedLift((prev) => ({
        label: tracker.stableLabel || prev.label || label,
        confidence,
        isActive: Boolean(tracker.stableLabel),
        isManual: false,
        status: tracker.stableLabel ? 'stable' : 'detecting',
      }));
      return;
    }

    if (tracker.stableLabel && now - tracker.stableAt < AUTO_LIFT_HOLD_MS) {
      setDetectedLift({
        label: tracker.stableLabel,
        confidence: tracker.stableConfidence,
        isActive: true,
        isManual: false,
        status: 'stable',
      });
      return;
    }

    resetAutoLift();
    setDetectedLift(DEFAULT_DETECTED_LIFT);
  };

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      setLastMessage(data);

      if (data.type === 'session_summary') {
        setCurrentSessionSummary({
          reps: data.reps,
          tutSec: data.tut_sec,
          avgTempoSec: data.avg_tempo_sec,
          repBreakdown: data.rep_breakdown || [],
          avgVelocityMs: data.avg_velocity_ms,
          velocityLossPct: data.velocity_loss_pct,
          avgRomM: data.avg_rom_m,
          romLossPct: data.rom_loss_pct,
          detectedLift: data.detected_lift,
          liftConfidence: data.lift_confidence,
          sessionId: data.session_id || data.sid || null,
          repTimesSec: data.rep_times_sec || [],
          totalReps: data.reps,
          outputLossPct: data.output_loss_pct,
          avgPeakSpeedProxy: data.avg_peak_speed_proxy,
          speedLossPct: data.speed_loss_pct,
          receivedAt: Date.now(),
        });
        return;
      }

      if (data.type === 'sessions_list' || data.type === 'sessions') {
        setSessionsList(data);
        setSessionsLoading(false);
        return;
      }

      if (data.type === 'session_detail') {
        setSelectedSessionSummary(data);
        setSelectedSessionLoading(false);
        return;
      }

      if (data.type === 'session_raw') {
        setSelectedSessionRawPoints(data);
        setSelectedSessionRawLoading(false);
        return;
      }

      if (data.type === 'export_result' || data.type === 'export_session') {
        setExportResult(data);
        setExportLoading(false);
        return;
      }

      if (data.type === 'rep_event') {
        const normalized = {
          rep: data.rep,
          timestamp: data.t,
          repTime: data.rep_time,
          confidence: data.confidence,
          peakGyro: data.peak_gyro,
          peakVelocityMs: data.peak_velocity_ms,
          meanConcentricVelocityMs: data.mean_concentric_velocity_ms,
          romM: data.rom_m,
          romCm: data.rom_cm,
          receivedAt: Date.now(),
        };
        setRepEvents((prev) => [...prev, normalized]);
        setLastRepEvent({
          rep: data.rep,
          time: data.rep_time,
          confidence: data.confidence,
          peakGyro: data.peak_gyro,
          peakVelocityMs: data.peak_velocity_ms,
          romCm: data.rom_cm,
        });
        addRepToSet(data);
        return;
      }

      if (data.reps !== undefined) setRepCount(data.reps);
      if (data.state !== undefined) setCurrentState(data.state);
      if (data.gyro_filt !== undefined) setGyroFilt(data.gyro_filt);
      if (data.detected_lift !== undefined) {
        handleAutoDetectedLift(data.detected_lift, data.lift_confidence);
      }

      if (data.type === 'ack') {
        if (data.action === 'start') {
          setRepCount(0);
          setIsRecording(true);
          setRepEvents([]);
          setCurrentSessionSummary(null);
          if (!manualLiftRef.current) {
            resetAutoLift();
            setDetectedLift(DEFAULT_DETECTED_LIFT);
          }
        } else if (data.action === 'stop') {
          setRepCount(data.reps !== undefined ? data.reps : repCount);
          setIsRecording(false);
        }
      }

      if (data.type === 'error') {
        if (data.action === 'sessions') setSessionsLoading(false);
        if (data.action === 'session_detail') setSelectedSessionLoading(false);
        if (data.action === 'session_raw') setSelectedSessionRawLoading(false);
        if (data.action === 'export_session') {
          setExportLoading(false);
          setExportResult({ ok: false, error: data.error || 'Export failed.' });
        }
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };

  const connect = (ws, ipAddress) => {
    if (wsRef.current) return;

    wsRef.current = ws;
    setWebsocket(ws);
    setConnectionStatus('connected');
    if (ipAddress) setPiIp(ipAddress);

    ws.onmessage = handleMessage;

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('error');
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      wsRef.current = null;
      setWebsocket(null);
    };
  };

  const disconnect = () => {
    if (!wsRef.current) return;
    wsRef.current.close();
    wsRef.current = null;
    setWebsocket(null);
    setConnectionStatus('disconnected');
    setRepCount(0);
    setCurrentState('WAITING');
    setIsRecording(false);
    setGyroFilt(0);
    manualLiftRef.current = null;
    resetAutoLift();
    setDetectedLift(DEFAULT_DETECTED_LIFT);
    setSessionsLoading(false);
    setSelectedSessionLoading(false);
    setSelectedSessionRawLoading(false);
    setExportLoading(false);
    clearSetData();
    setLiveFatigue(DEFAULT_LIVE_FATIGUE);
  };

  const sendMessage = (message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  };

  const startRecording = () => {
    const sent = sendMessage({ type: 'command', action: 'start' });
    if (!sent) return;
    setIsRecording(true);
    setRepCount(0);
    setRepEvents([]);
    setCurrentSessionSummary(null);
    setLastRepEvent(null);
    if (!manualLiftRef.current) {
      resetAutoLift();
      setDetectedLift(DEFAULT_DETECTED_LIFT);
    }
  };

  const stopRecording = () => {
    const sent = sendMessage({ type: 'command', action: 'stop' });
    if (sent) setIsRecording(false);
  };

  const setManualLift = (label) => {
    const normalizedLabel = normalizeLiftLabel(label);

    if (!normalizedLabel) {
      manualLiftRef.current = null;
      resetAutoLift();
      setDetectedLift(DEFAULT_DETECTED_LIFT);
      return;
    }

    manualLiftRef.current = normalizedLabel;
    setDetectedLift({
      label: normalizedLabel,
      confidence: 1,
      isActive: true,
      isManual: true,
      status: 'manual',
    });
  };

  const requestSessions = (limit = 30) => {
    setSessionsLoading(true);
    const sent = sendMessage({ type: 'command', action: 'sessions', limit });
    if (!sent) {
      setSessionsLoading(false);
      setSessionsList({ sessions: [], count: 0, error: 'Not connected.' });
    }
  };

  const requestSessionDetail = (sessionId) => {
    if (!sessionId) return;
    setSelectedSessionLoading(true);
    const sent = sendMessage({ type: 'command', action: 'session_detail', session_id: sessionId });
    if (!sent) {
      setSelectedSessionLoading(false);
      setSelectedSessionSummary({ error: 'Not connected.' });
    }
  };

  const requestSessionRaw = (sessionId, maxPoints = 2000, downsample = 5) => {
    if (!sessionId) return;
    setSelectedSessionRawLoading(true);
    const sent = sendMessage({
      type: 'command',
      action: 'session_raw',
      session_id: sessionId,
      max_points: maxPoints,
      downsample,
    });
    if (!sent) {
      setSelectedSessionRawLoading(false);
      setSelectedSessionRawPoints({ points: [] });
    }
  };

  const clearSelectedSession = () => {
    setSelectedSessionSummary(null);
    setSelectedSessionRawPoints(null);
    setSelectedSessionLoading(false);
    setSelectedSessionRawLoading(false);
  };

  const requestExportSession = (sessionId, timeoutMs = 8000) => {
    if (!sessionId) return;
    setExportLoading(true);
    setExportResult(null);
    const sent = sendMessage({
      type: 'command',
      action: 'export_session',
      session_id: sessionId,
      timeout_ms: timeoutMs,
    });
    if (!sent) {
      setExportLoading(false);
      setExportResult({ ok: false, error: 'Not connected.' });
    }
  };

  const clearExportResult = () => {
    setExportResult(null);
  };

  const buildExportUrl = (downloadUrlTemplate) => {
    if (!downloadUrlTemplate) return null;
    if (/^https?:\/\//i.test(downloadUrlTemplate)) return downloadUrlTemplate;
    if (!piIp) return null;

    const replaced = String(downloadUrlTemplate)
      .replace('{pi_ip}', piIp)
      .replace('{PI_IP}', piIp)
      .replace('{{PI_IP}}', piIp);

    if (/^https?:\/\//i.test(replaced)) return replaced;
    const normalizedPath = replaced.startsWith('/') ? replaced : `/${replaced}`;
    return `http://${piIp}:8766${normalizedPath}`;
  };

  const value = {
    websocket,
    connectionStatus,
    lastMessage,
    repCount,
    currentState,
    isRecording,
    gyroFilt,
    repEvents,
    lastRepEvent,
    currentSessionSummary,
    sessionWeight,
    sessionWeightUnit,
    currentSet,
    isSetActive,
    setHistory,
    liveFatigue,
    detectedLift,
    piIp,
    piIpAddress: piIp,
    sessionsList,
    sessionsLoading,
    selectedSessionSummary,
    selectedSessionLoading,
    selectedSessionRawPoints,
    selectedSessionRawLoading,
    exportResult,
    exportLoading,
    setPiIp,
    setSessionWeight,
    setSessionWeightUnit,
    startSet,
    endSet,
    clearSetData,
    connect,
    disconnect,
    sendMessage,
    startRecording,
    stopRecording,
    setManualLift,
    requestSessions,
    requestSessionDetail,
    requestSessionRaw,
    clearSelectedSession,
    requestExportSession,
    clearExportResult,
    buildExportUrl,
  };

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }
  return context;
}

