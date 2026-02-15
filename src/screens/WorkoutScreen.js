import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import LiveChart from '../components/LiveChart';
import { useWebSocket } from '../context/WebSocketContext';
import { theme } from '../theme/performanceLabTheme';

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
  DSP: 'Shoulder Press',
  SBCTP: 'Tricep Pushdown',
  HT: 'Hip Thrust',
  MIBP: 'Bench Press',
  squat: 'Squat',
  bench: 'Bench Press',
  deadlift: 'Deadlift',
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

function getExerciseName(code) {
  if (!code) return 'Auto Detect';
  return EXERCISE_NAMES[code] || code;
}

export default function WorkoutScreen({ onDisconnect, onEndWorkout, onBack }) {
  const {
    connectionStatus,
    repCount,
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
  const [sessionSamples, setSessionSamples] = useState([]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [wasRecording, setWasRecording] = useState(false);
  const startPulseAnim = useRef(new Animated.Value(1)).current;
  const prevRepCount = useRef(0);

  useEffect(() => {
    if (isRecording && !wasRecording) {
      setStartTime(Date.now());
      setChartData([]);
      setSessionSamples([]);
      prevRepCount.current = 0;
    }
    setWasRecording(isRecording);
  }, [isRecording, wasRecording]);

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
    Vibration.vibrate(10);
  }, [repCount]);

  useEffect(() => {
    if (isRecording || connectionStatus !== 'connected') {
      startPulseAnim.stopAnimation();
      startPulseAnim.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(startPulseAnim, {
          toValue: 1.03,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(startPulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, connectionStatus, startPulseAnim]);

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

  const velocities = useMemo(
    () => repEvents.map((e) => e.peakVelocityMs).filter((v) => typeof v === 'number' && Number.isFinite(v)),
    [repEvents]
  );

  const avgVelocity = velocities.length
    ? velocities.reduce((sum, value) => sum + value, 0) / velocities.length
    : currentSessionSummary?.avgVelocityMs || 0;

  const peakVelocity = velocities.length ? Math.max(...velocities) : avgVelocity;
  const liveVelocity = lastRepEvent?.peakVelocityMs ?? avgVelocity ?? 0;

  const romPercent = useMemo(() => {
    if (typeof currentSessionSummary?.romLossPct === 'number') {
      return Math.max(0, Math.min(100, 100 - currentSessionSummary.romLossPct));
    }
    const romValues = repEvents
      .map((e) => (typeof e.romM === 'number' ? e.romM : typeof e.romCm === 'number' ? e.romCm / 100 : null))
      .filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (!romValues.length) return 0;
    const baseline = romValues[0] || 1;
    const avgRom = romValues.reduce((sum, value) => sum + value, 0) / romValues.length;
    return Math.max(0, Math.min(100, (avgRom / baseline) * 100));
  }, [currentSessionSummary?.romLossPct, repEvents]);

  const confidencePct = Math.round((detectedLift.confidence || 0) * 100);
  const isConnected = connectionStatus === 'connected';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Live</Text>
        <TouchableOpacity onPress={handleDisconnect} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>Exit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!isConnected && (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>Connection lost. Reconnect to continue telemetry.</Text>
          </View>
        )}

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Velocity</Text>
          <Text style={styles.heroValue}>{liveVelocity.toFixed(2)} m/s</Text>
        </View>

        <View style={styles.graphShell}>
          <LiveChart data={chartData} />
        </View>

        <View style={styles.statsGrid}>
          <MetricCard label="Avg Velocity" value={`${avgVelocity.toFixed(2)} m/s`} />
          <MetricCard label="Peak Velocity" value={`${peakVelocity.toFixed(2)} m/s`} />
          <MetricCard label="Reps" value={`${repCount}`} />
          <MetricCard label="ROM %" value={`${Math.round(romPercent)}%`} />
        </View>

        <Pressable style={({ pressed }) => [styles.exerciseRow, pressed && styles.metricPressed]} onPress={() => setShowExercisePicker(true)}>
          <View>
            <Text style={styles.exerciseLabel}>Exercise</Text>
            <Text style={styles.exerciseValue}>{getExerciseName(detectedLift.label)}</Text>
          </View>
          <Text style={styles.exerciseAction}>Change</Text>
        </Pressable>

        <View style={styles.confidenceSection}>
          <View style={styles.confidenceHeader}>
            <Text style={styles.confidenceLabel}>Detection confidence</Text>
            <Text style={styles.confidenceValue}>{confidencePct}%</Text>
          </View>
          <View style={styles.confidenceTrack}>
            <View style={[styles.confidenceFill, { width: `${confidencePct}%` }]} />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {!isRecording ? (
          <Animated.View style={{ transform: [{ scale: startPulseAnim }] }}>
            <TouchableOpacity
              style={[styles.primaryButton, !isConnected && styles.primaryButtonDisabled]}
              onPress={handleStartWorkout}
              disabled={!isConnected}
            >
              <Text style={styles.primaryButtonText}>{repCount > 0 ? 'Start New Set' : 'Start Set'}</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <TouchableOpacity style={styles.stopButton} onPress={handleStopWorkout}>
            <Text style={styles.stopButtonText}>Stop Set</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={showExercisePicker} animationType="slide" transparent onRequestClose={() => setShowExercisePicker(false)}>
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
                    style={[styles.exerciseItem, selected && styles.exerciseItemSelected]}
                    onPress={() => handleSelectExercise(exercise.code)}
                  >
                    <Text style={styles.exerciseItemName}>{exercise.name}</Text>
                    <Text style={styles.exerciseItemCode}>{exercise.code}</Text>
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

function MetricCard({ label, value }) {
  return (
    <Pressable style={({ pressed }) => [styles.metricCard, pressed && styles.metricPressed]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerButton: {
    minWidth: 52,
  },
  headerButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  content: {
    padding: 16,
    paddingBottom: 20,
  },
  warningCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 93, 115, 0.38)',
    backgroundColor: 'rgba(255, 93, 115, 0.12)',
    padding: 12,
    marginBottom: 12,
  },
  warningText: {
    color: theme.colors.danger,
    fontSize: 12,
    textAlign: 'center',
  },
  heroCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  heroLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: theme.colors.textMuted,
    marginBottom: 8,
  },
  heroValue: {
    color: theme.colors.accent,
    fontSize: 72,
    fontWeight: '700',
    lineHeight: 76,
  },
  graphShell: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    paddingVertical: 12,
    marginBottom: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metricCard: {
    width: '48%',
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    paddingVertical: 18,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  metricPressed: {
    transform: [{ translateY: -2 }],
    backgroundColor: theme.colors.bgElevated,
  },
  metricLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginBottom: 5,
  },
  metricValue: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  exerciseRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  exerciseLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  exerciseValue: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 3,
  },
  exerciseAction: {
    color: theme.colors.accentActive,
    fontSize: 13,
    fontWeight: '600',
  },
  confidenceSection: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 16,
  },
  confidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  confidenceLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  confidenceValue: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  confidenceTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: theme.colors.accent,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    padding: 16,
    backgroundColor: theme.colors.bg,
  },
  primaryButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#3f4d5a',
  },
  primaryButtonText: {
    color: theme.colors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  stopButton: {
    backgroundColor: theme.colors.danger,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  stopButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  modalCard: {
    maxHeight: '75%',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    paddingBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  modalClose: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  autoRow: {
    margin: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  autoRowTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  autoRowSub: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  exerciseList: {
    paddingHorizontal: 12,
  },
  exerciseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  exerciseItemSelected: {
    borderColor: theme.colors.accentActive,
    backgroundColor: theme.colors.accentSoft,
  },
  exerciseItemName: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  exerciseItemCode: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
});

