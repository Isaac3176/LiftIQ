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
import SkeletonAvatar3D from '../components/SkeletonAvatar3D';
import { theme } from '../theme/performanceLabTheme';
import {
  computePathMetrics,
  demoPath,
  reconstructPath,
  synthPathFromReps,
} from '../utils/barPath';
import { generatePoseSequence } from '../utils/liftPose';

const SPIN_STEP_DEG = 1.4;
const SPIN_INTERVAL_MS = 45;
const PLAYBACK_INTERVAL_MS = 45;

const PATTERN_LABELS = {
  squat: 'Squat pattern',
  hinge: 'Hip hinge',
  press: 'Press',
  curl: 'Curl',
  row: 'Row',
  generic: 'General lift',
};

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

  const { frames, pattern } = useMemo(
    () => generatePoseSequence(points, sessionData?.set?.exercise || sessionData),
    [points, sessionData]
  );

  const [mode, setMode] = useState('path'); // 'path' | 'avatar'
  const [angle, setAngle] = useState(20);
  const [autoRotate, setAutoRotate] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [frameIdx, setFrameIdx] = useState(0);

  useEffect(() => {
    if (!autoRotate) return undefined;
    const id = setInterval(() => setAngle((a) => (a + SPIN_STEP_DEG) % 360), SPIN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRotate]);

  useEffect(() => {
    if (mode !== 'avatar' || !playing || frames.length < 2) return undefined;
    const id = setInterval(() => setFrameIdx((i) => (i + 1) % frames.length), PLAYBACK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [mode, playing, frames.length]);

  const nudge = (delta) => {
    setAutoRotate(false);
    setAngle((a) => (a + delta + 360) % 360);
  };

  const activeFrame = frames[Math.min(frameIdx, frames.length - 1)];
  const repProgress = frames.length > 1 ? Math.round((frameIdx / (frames.length - 1)) * 100) : 0;

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
        <Text style={styles.headerTitle}>3D Motion</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.exercise}>{exerciseName}</Text>
        {source !== 'live' && (
          <View style={styles.noticeBanner}>
            <Text style={styles.noticeText}>
              {source === 'reps'
                ? 'Approximate motion reconstructed from rep metrics (no motion stream saved).'
                : 'Demo motion — record a set to see your real lift.'}
            </Text>
          </View>
        )}

        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'path' && styles.modeButtonActive]}
            onPress={() => setMode('path')}
          >
            <Text style={[styles.modeText, mode === 'path' && styles.modeTextActive]}>Bar Path</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'avatar' && styles.modeButtonActive]}
            onPress={() => setMode('avatar')}
          >
            <Text style={[styles.modeText, mode === 'avatar' && styles.modeTextActive]}>Avatar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.viewerCard}>
          {mode === 'path' ? (
            <BarPath3D
              points={points}
              peakVelocity={peakVelocity}
              width={viewSize}
              height={viewSize}
              autoRotate={false}
              angleDeg={angle}
            />
          ) : (
            <SkeletonAvatar3D
              pose={activeFrame?.pose}
              bar={activeFrame?.bar}
              width={viewSize}
              height={viewSize}
              angleDeg={angle}
              boneColor={verticalityColor}
            />
          )}
          {mode === 'avatar' && (
            <View style={styles.playbackRow}>
              <TouchableOpacity style={styles.playButton} onPress={() => setPlaying((p) => !p)}>
                <Text style={styles.playButtonText}>{playing ? '❚❚' : '▶'}</Text>
              </TouchableOpacity>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${repProgress}%` }]} />
              </View>
              <Text style={styles.patternLabel}>{PATTERN_LABELS[pattern] || 'Lift'}</Text>
            </View>
          )}
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

        {mode === 'path' && (
          <View style={styles.legend}>
            <LegendDot color={theme.colors.success} label="Fast" />
            <LegendDot color={theme.colors.warning} label="Slowing" />
            <LegendDot color={theme.colors.danger} label="Slow" />
            <LegendDot color={theme.colors.border} label="Ideal" dashed />
          </View>
        )}

        {mode === 'avatar' && (
          <View style={[styles.cueCard, { borderLeftColor: verticalityColor }]}>
            <Text style={styles.cueLabel}>Coaching cue</Text>
            <Text style={[styles.cueText, { color: verticalityColor }]}>{getFormCue(metrics)}</Text>
          </View>
        )}

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

function getFormCue(metrics) {
  if (!metrics) return 'Recording motion…';
  if (metrics.horizontalDriftCm >= 8) return 'Bar drifting — keep it stacked over midfoot.';
  if (metrics.verticalityScore >= 85) return 'Clean, vertical bar path. Nice control.';
  if (metrics.verticalityScore >= 70) return 'Minor path deviation — tighten the line.';
  return 'Significant path deviation — focus on bar control.';
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
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modeButton: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  modeButtonActive: { backgroundColor: theme.colors.accentSoft },
  modeText: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '600' },
  modeTextActive: { color: theme.colors.accent },
  playbackRow: { flexDirection: 'row', alignItems: 'center', width: '100%', paddingHorizontal: 16, marginTop: 8 },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  playButtonText: { color: theme.colors.accent, fontSize: 13, fontWeight: '700' },
  progressTrack: { flex: 1, height: 5, borderRadius: 999, backgroundColor: theme.colors.bgElevated, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: theme.colors.accent, borderRadius: 999 },
  patternLabel: { color: theme.colors.textMuted, fontSize: 11, marginLeft: 10 },
  cueCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 3,
  },
  cueLabel: { color: theme.colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  cueText: { fontSize: 14, fontWeight: '600' },
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
