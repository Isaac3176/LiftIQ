import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import LiveChart from '../components/LiveChart';
import { useWebSocket } from '../context/WebSocketContext';

const EXERCISE_NAMES = {
  SBLP: 'Lat Pulldown',
  CGCR: 'Cable Row',
  NGCR: 'Cable Row',
  SAP: 'Single Arm Pulldown',
  MGTBR: 'T-Bar Row',
  AIDBC: 'Bicep Curl',
  MPBC: 'Preacher Curl',
  SHC: 'Hamstring Curl',
  SMS: 'Smith Squat',
  LE: 'Leg Extension',
  '30DBP': 'Incline DB Press',
  DSP: 'Shoulder Press',
  DLR: 'Lateral Raise',
  SACLR: 'Cable Lateral Raise',
  MRF: 'Rear Fly',
  FAPU: 'Face Pull',
  SBCTP: 'Tricep Pushdown',
  MSP: 'Machine Shoulder Press',
  SECR: 'Calf Raise',
  PUSH: 'Push-up',
  PULL: 'Pull-up',
  MTE: 'Tricep Extension',
  SHSS: 'Smith Squat',
  STCR: 'Seated Calf Raise',
  ILE: 'Leg Extension',
  CRDP: 'Rear Delt Pull',
  MIBP: 'Incline Press',
  APULL: 'Assisted Pull-up',
  PREC: 'Preacher Curl',
  SSLHS: 'Single Leg Squat',
  HT: 'Hip Thrust',
  SAOCTE: 'Overhead Tricep',
  '45DBP': 'Incline DB Press',
  SAODTE: 'Overhead Tricep',
  LHC: 'Lying Ham Curl',
  IDBC: 'Incline Bicep Curl',
  DWC: 'Wrist Curl',
  CGOCTE: 'Overhead Tricep',
  '30BP': 'Incline Bench Press',
  squat: 'Squat',
  bench: 'Bench Press',
  deadlift: 'Deadlift',
  ohp: 'Overhead Press',
  row: 'Row',
  curl: 'Bicep Curl',
};

const COMMON_EXERCISES = [
  { code: 'SMS', name: 'Squat' },
  { code: 'MIBP', name: 'Bench Press' },
  { code: 'SBLP', name: 'Lat Pulldown' },
  { code: 'CGCR', name: 'Cable Row' },
  { code: 'DSP', name: 'Shoulder Press' },
  { code: 'AIDBC', name: 'Bicep Curl' },
  { code: 'SBCTP', name: 'Tricep Pushdown' },
  { code: 'LE', name: 'Leg Extension' },
  { code: 'SHC', name: 'Hamstring Curl' },
  { code: 'HT', name: 'Hip Thrust' },
];

const MOTION_STATE = {
  WAITING: { label: 'Ready', color: '#f59e0b' },
  MOVING: { label: 'Moving', color: '#22c55e' },
  CALIBRATING: { label: 'Calibrating', color: '#3b82f6' },
};

function formatDuration(seconds) {
  const safe = Math.max(0, seconds || 0);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function getExerciseName(code) {
  if (!code) return 'No exercise selected';
  return EXERCISE_NAMES[code] || code;
}

function getConfidenceLabel(confidence) {
  if (confidence >= 0.8) return 'High';
  if (confidence >= 0.6) return 'Medium';
  return 'Low';
}

export default function WorkoutScreen({ onDisconnect, onEndWorkout, onBack }) {
  const {
    connectionStatus,
    repCount,
    currentState,
    isRecording,
    gyroFilt,
    lastMessage,
    repEvents,
    lastRepEvent,
    currentSessionSummary,
    detectedLift,
    startRecording,
    stopRecording,
    disconnect,
    setManualLift,
  } = useWebSocket();

  const [chartData, setChartData] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [sessionSamples, setSessionSamples] = useState([]);
  const [wasRecording, setWasRecording] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const prevRepCount = useRef(0);

  useEffect(() => {
    if (isRecording && !wasRecording) {
      const now = Date.now();
      setStartTime(now);
      setElapsedSec(0);
      setChartData([]);
      setSessionSamples([]);
      prevRepCount.current = 0;
    }
    setWasRecording(isRecording);
  }, [isRecording, wasRecording]);

  useEffect(() => {
    if (!isRecording || !startTime) return undefined;
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isRecording, startTime]);

  useEffect(() => {
    if (!lastMessage) return;

    if (typeof lastMessage.gyro_filt === 'number') {
      setChartData((prev) => [...prev, lastMessage.gyro_filt].slice(-100));
    }

    if (isRecording && lastMessage.type === 'rep_update') {
      setSessionSamples((prev) => [...prev, { ...lastMessage, timestamp: Date.now() }]);
    }
  }, [lastMessage, isRecording]);

  useEffect(() => {
    if (repCount <= prevRepCount.current) return;
    prevRepCount.current = repCount;
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.07, duration: 120, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  }, [repCount, pulseAnim]);

  const handleDisconnect = () => {
    disconnect();
    onDisconnect();
  };

  const handleStartWorkout = () => {
    if (isRecording || connectionStatus !== 'connected') return;
    startRecording();
  };

  const handleStopWorkout = () => {
    if (!isRecording) return;
    stopRecording();

    const duration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    const avgRepTime = repEvents.length
      ? repEvents.reduce((sum, item) => sum + item.repTime, 0) / repEvents.length
      : 0;
    const avgConfidence = repEvents.length
      ? repEvents.reduce((sum, item) => sum + item.confidence, 0) / repEvents.length
      : 0;

    setTimeout(() => {
      onEndWorkout({
        reps: repCount,
        duration,
        samples: sessionSamples,
        repEvents,
        serverSummary: currentSessionSummary,
        avgRepTime,
        avgConfidence,
        startTime,
        endTime: Date.now(),
        detectedLift: detectedLift.label,
        liftConfidence: detectedLift.confidence,
        exercise: getExerciseName(detectedLift.label),
      });
    }, 800);
  };

  const handleSelectExercise = (exerciseCode) => {
    setManualLift(exerciseCode);
    setShowExercisePicker(false);
  };

  const isConnected = connectionStatus === 'connected';
  const isReconnecting = connectionStatus === 'disconnected' && wasRecording;
  const stateMeta = MOTION_STATE[currentState] || { label: currentState, color: '#94a3b8' };
  const confidencePct = Math.round((detectedLift.confidence || 0) * 100);
  const exerciseStatus = detectedLift.isManual
    ? 'Manual selection'
    : detectedLift.status === 'stable'
      ? 'Auto-detected'
      : detectedLift.status === 'detecting'
        ? 'Analyzing movement'
        : 'Waiting for movement';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Workout</Text>
          <Text style={[styles.headerStatus, { color: isConnected ? '#22c55e' : '#ef4444' }]}>
            {isReconnecting ? 'Reconnecting...' : isConnected ? 'Connected' : 'Disconnected'}
          </Text>
        </View>
        <TouchableOpacity onPress={handleDisconnect} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>Exit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!isConnected && !isReconnecting && (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>Connection lost. Return to connect screen.</Text>
          </View>
        )}

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Reps</Text>
          <Animated.Text style={[styles.heroCount, { transform: [{ scale: pulseAnim }] }]}>
            {repCount}
          </Animated.Text>
          <View style={styles.heroMetaRow}>
            <View style={styles.heroChip}>
              <Text style={[styles.heroChipText, { color: stateMeta.color }]}>{stateMeta.label}</Text>
            </View>
            <View style={styles.heroChip}>
              <Text style={styles.heroChipText}>{formatDuration(elapsedSec)}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.exerciseCard}
          onPress={() => setShowExercisePicker(true)}
          activeOpacity={0.8}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Exercise</Text>
            <Text style={styles.cardAction}>Change</Text>
          </View>
          <Text style={styles.exerciseName}>{getExerciseName(detectedLift.label)}</Text>
          <Text style={styles.exerciseSubtext}>{exerciseStatus}</Text>

          {!detectedLift.isManual && (
            <View style={styles.confidenceSection}>
              <View style={styles.confidenceHeader}>
                <Text style={styles.confidenceLabel}>Model confidence</Text>
                <Text style={styles.confidenceValue}>
                  {confidencePct}% {getConfidenceLabel(detectedLift.confidence || 0)}
                </Text>
              </View>
              <View style={styles.confidenceTrack}>
                <View style={[styles.confidenceFill, { width: `${confidencePct}%` }]} />
              </View>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Last rep</Text>
            <Text style={styles.statValue}>
              {lastRepEvent?.time ? `${lastRepEvent.time.toFixed(2)}s` : '-'}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Rep events</Text>
            <Text style={styles.statValue}>{repEvents.length}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Gyro</Text>
            <Text style={styles.statValue}>{Number(gyroFilt || 0).toFixed(1)}</Text>
          </View>
        </View>

        <View style={styles.chartCard}>
          <Text style={styles.cardTitle}>Live Signal</Text>
          <LiveChart data={chartData} />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {!isRecording ? (
          <TouchableOpacity
            style={[styles.primaryButton, !isConnected && styles.primaryButtonDisabled]}
            onPress={handleStartWorkout}
            disabled={!isConnected}
          >
            <Text style={styles.primaryButtonText}>
              {repCount > 0 ? 'Start New Session' : 'Start Workout'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.stopButton} onPress={handleStopWorkout}>
            <Text style={styles.primaryButtonText}>Stop Workout</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={showExercisePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowExercisePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Exercise</Text>
              <TouchableOpacity onPress={() => setShowExercisePicker(false)}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.autoRow} onPress={() => handleSelectExercise(null)}>
              <Text style={styles.autoRowTitle}>Auto Detect</Text>
              <Text style={styles.autoRowSub}>Use model detection and stabilization</Text>
            </TouchableOpacity>

            <ScrollView style={styles.exerciseList} showsVerticalScrollIndicator={false}>
              {COMMON_EXERCISES.map((exercise) => {
                const selected = detectedLift.label === exercise.code && detectedLift.isManual;
                return (
                  <TouchableOpacity
                    key={exercise.code}
                    style={[styles.exerciseRow, selected && styles.exerciseRowSelected]}
                    onPress={() => handleSelectExercise(exercise.code)}
                  >
                    <Text style={styles.exerciseRowName}>{exercise.name}</Text>
                    <Text style={styles.exerciseRowCode}>{exercise.code}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090e14',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#18202b',
  },
  headerButton: {
    minWidth: 54,
  },
  headerButtonText: {
    color: '#8fa4bb',
    fontSize: 14,
    fontWeight: '600',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
  },
  headerStatus: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  warningCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 14,
    padding: 12,
  },
  warningText: {
    color: '#fca5a5',
    fontSize: 13,
    textAlign: 'center',
  },
  heroCard: {
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: '#0f1722',
    borderWidth: 1,
    borderColor: '#1f2a39',
    marginBottom: 12,
  },
  heroLabel: {
    color: '#7b8ea5',
    fontSize: 14,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroCount: {
    color: '#22c55e',
    fontSize: 86,
    fontWeight: '800',
    lineHeight: 92,
  },
  heroMetaRow: {
    marginTop: 12,
    flexDirection: 'row',
  },
  heroChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#131f2c',
    marginHorizontal: 5,
  },
  heroChipText: {
    color: '#c6d4e3',
    fontSize: 12,
    fontWeight: '600',
  },
  exerciseCard: {
    backgroundColor: '#0f1722',
    borderWidth: 1,
    borderColor: '#1f2a39',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    color: '#d7e3f0',
    fontSize: 15,
    fontWeight: '600',
  },
  cardAction: {
    color: '#7b8ea5',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  exerciseName: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  exerciseSubtext: {
    color: '#8fa4bb',
    fontSize: 13,
  },
  confidenceSection: {
    marginTop: 12,
  },
  confidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  confidenceLabel: {
    color: '#7b8ea5',
    fontSize: 12,
  },
  confidenceValue: {
    color: '#c6d4e3',
    fontSize: 12,
    fontWeight: '600',
  },
  confidenceTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#1c2836',
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: '#22c55e',
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#0f1722',
    borderWidth: 1,
    borderColor: '#1f2a39',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  statLabel: {
    color: '#7b8ea5',
    fontSize: 11,
    marginBottom: 5,
  },
  statValue: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  chartCard: {
    backgroundColor: '#0f1722',
    borderWidth: 1,
    borderColor: '#1f2a39',
    borderRadius: 16,
    padding: 14,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#18202b',
    padding: 16,
  },
  primaryButton: {
    backgroundColor: '#22c55e',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#334155',
  },
  stopButton: {
    backgroundColor: '#ef4444',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '75%',
    backgroundColor: '#0f1722',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: '#243445',
    paddingBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2a39',
  },
  modalTitle: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '700',
  },
  modalClose: {
    color: '#8fa4bb',
    fontSize: 13,
    fontWeight: '600',
  },
  autoRow: {
    margin: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#131f2c',
    borderWidth: 1,
    borderColor: '#243445',
  },
  autoRowTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  autoRowSub: {
    color: '#8fa4bb',
    fontSize: 12,
    marginTop: 2,
  },
  exerciseList: {
    paddingHorizontal: 12,
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#131f2c',
    borderWidth: 1,
    borderColor: '#243445',
  },
  exerciseRowSelected: {
    borderColor: '#22c55e',
    backgroundColor: '#10291a',
  },
  exerciseRowName: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
  },
  exerciseRowCode: {
    color: '#8fa4bb',
    fontSize: 12,
    fontWeight: '600',
  },
});
