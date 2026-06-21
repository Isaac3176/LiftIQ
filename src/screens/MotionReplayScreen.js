import React, { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import BarPath3D from '../components/BarPath3D';
import { theme } from '../theme/performanceLabTheme';
import {
  computePathMetrics,
  demoPath,
  reconstructPath,
  synthPathFromReps,
} from '../utils/barPath';

const SPIN_STEP_DEG = 1.4;
const SPIN_INTERVAL_MS = 45;

/**
 * Model 6 - Phase A: 3D bar-path viewer.
 *
 * Reconstructs the barbell trajectory for a completed set and renders it as a
 * rotating, velocity-colored 3D path. Data priority:
 *   1. live IMU samples (sessionData.samples)
 *   2. per-rep metrics (synthesized approximation)
 *   3. built-in demo path
 */
export default function MotionReplayScreen({ sessionData, onBack }) {
  const { width } = Dimensions.get('window');
  const viewSize = Math.min(width - 32, 360);

  const exerciseName =
    sessionData?.set?.exercise?.name ||
    sessionData?.exercise ||
    sessionData?.set?.exercise?.code ||
    'Bar Path';

  const { points, source } = useMemo(() => resolvePath(sessionData), [sessionData]);
  const metrics = useMemo(() => computePathMetrics(points), [points]);
  const peakVelocity = metrics?.peakVelocity || 1;

  const [angle, setAngle] = useState(20);
  const [autoRotate, setAutoRotate] = useState(true);

  useEffect(() => {
    if (!autoRotate) return undefined;
    const id = setInterval(() => setAngle((a) => (a + SPIN_STEP_DEG) % 360), SPIN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRotate]);

  const nudge = (delta) => {
    setAutoRotate(false);
    setAngle((a) => (a + delta + 360) % 360);
  };

  const verticalityColor =
    metrics && metrics.verticalityScore >= 85
      ? theme.colors.success
      : metrics && metrics.verticalityScore >= 70
      ? theme.colors.warning
      : theme.colors.danger;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerSide}>
          <Text style={styles.backButton}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>3D Bar Path</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.exercise}>{exerciseName}</Text>
        {source !== 'live' && (
          <View style={styles.noticeBanner}>
            <Text style={styles.noticeText}>
              {source === 'reps'
                ? 'Approximate path reconstructed from rep metrics (no motion stream saved).'
                : 'Demo path — record a set to see your real bar trajectory.'}
            </Text>
          </View>
        )}

        <View style={styles.viewerCard}>
          <BarPath3D
            points={points}
            peakVelocity={peakVelocity}
            width={viewSize}
            height={viewSize}
            autoRotate={false}
            angleDeg={angle}
          />
        </View>

        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlButton} onPress={() => nudge(-15)}>
            <Text style={styles.controlText}>⟲ Rotate</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlButton, styles.controlPrimary, autoRotate && styles.controlActive]}
            onPress={() => setAutoRotate((v) => !v)}
          >
            <Text style={[styles.controlText, autoRotate && styles.controlTextActive]}>
              {autoRotate ? '❚❚ Pause' : '▶ Spin'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton} onPress={() => nudge(15)}>
            <Text style={styles.controlText}>Rotate ⟳</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.legend}>
          <LegendDot color={theme.colors.success} label="Fast" />
          <LegendDot color={theme.colors.warning} label="Slowing" />
          <LegendDot color={theme.colors.danger} label="Slow" />
          <LegendDot color={theme.colors.border} label="Ideal" dashed />
        </View>

        {metrics ? (
          <>
            <View style={styles.metricsGrid}>
              <Metric label="Vertical ROM" value={`${metrics.verticalRangeCm} cm`} />
              <Metric label="Horizontal Drift" value={`${metrics.horizontalDriftCm} cm`} />
              <Metric label="Verticality" value={`${metrics.verticalityScore}%`} valueColor={verticalityColor} />
              <Metric label="Peak Velocity" value={`${metrics.peakVelocity} m/s`} />
            </View>

            <View style={styles.diagnosisCard}>
              <Text style={styles.diagnosisLabel}>Path Shape</Text>
              <Text style={[styles.diagnosisValue, { color: verticalityColor }]}>{metrics.arcType}</Text>
              <Text style={styles.diagnosisDetail}>
                Forward/back {metrics.forwardDriftCm} cm · lateral {metrics.lateralDriftCm} cm
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.diagnosisCard}>
            <Text style={styles.diagnosisDetail}>Not enough motion data to analyze the bar path.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function resolvePath(sessionData) {
  const samples = sessionData?.samples || sessionData?.set?.samples;
  const fromSamples = reconstructPath(samples);
  if (fromSamples.hasData) return { points: fromSamples.points, source: 'live' };

  const reps = sessionData?.set?.reps || sessionData?.reps;
  if (Array.isArray(reps)) {
    const fromReps = synthPathFromReps(reps);
    if (fromReps.hasData) return { points: fromReps.points, source: 'reps' };
  }

  return { points: demoPath().points, source: 'demo' };
}

function Metric({ label, value, valueColor }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function LegendDot({ color, label, dashed }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: dashed ? 'transparent' : color, borderColor: color, borderWidth: dashed ? 1 : 0 }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerSide: { width: 40 },
  backButton: { fontSize: 32, color: theme.colors.textSecondary, fontWeight: '300' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.textPrimary },
  content: { padding: 16, paddingBottom: 32 },
  exercise: { color: theme.colors.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: 10 },
  noticeBanner: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  noticeText: { color: theme.colors.textMuted, fontSize: 12 },
  viewerCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 14,
  },
  controls: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  controlButton: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  controlPrimary: { flex: 1.2 },
  controlActive: { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent },
  controlText: { color: theme.colors.textSecondary, fontSize: 13, fontWeight: '600' },
  controlTextActive: { color: theme.colors.accent },
  legend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 5 },
  legendLabel: { color: theme.colors.textMuted, fontSize: 11 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  metricCard: {
    width: '48%',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  metricLabel: { color: theme.colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  metricValue: { color: theme.colors.textPrimary, fontSize: 22, fontWeight: '700' },
  diagnosisCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: 4,
  },
  diagnosisLabel: { color: theme.colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  diagnosisValue: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  diagnosisDetail: { color: theme.colors.textSecondary, fontSize: 13 },
});
