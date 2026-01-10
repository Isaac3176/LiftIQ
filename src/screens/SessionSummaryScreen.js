import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import Svg, { Circle, Line, Polyline, Path } from 'react-native-svg';

export default function SessionSummaryScreen({ sessionData, onViewHistory, onBackToDashboard }) {
  // ---- Safe getters (supports both old + new shapes) ----
  const totalReps =
    sessionData?.total_reps ?? sessionData?.reps ?? 0;

  const durationSec =
    sessionData?.duration_sec ?? sessionData?.duration ?? 0;

  const startTime =
    sessionData?.start_time ?? sessionData?.startTime ?? null;

  const endTime =
    sessionData?.end_time ?? sessionData?.endTime ?? null;

  const avgRepTime =
    sessionData?.avg_rep_time_sec ?? 0;

  const tutSec =
    sessionData?.tut_sec ?? 0;

  const device = sessionData?.device_info ?? {};
  const thresholds = sessionData?.thresholds ?? {};

  // Placeholder charts (until you compute real velocity/power)
  const velocityData = useMemo(() => [0.32, 0.31, 0.29, 0.28, 0.26, 0.24, 0.22, 0.20], []);
  const powerData = useMemo(() => [450, 445, 430, 415, 400, 380, 360, 340], []);
  const barPathData = useMemo(
    () => [
      { x: 50, y: 100 },
      { x: 52, y: 80 },
      { x: 50, y: 60 },
      { x: 48, y: 40 },
      { x: 50, y: 20 },
    ],
    []
  );

  const formatDuration = (seconds) => {
    const s = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatClock = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  };

  const renderVelocityChart = () => {
    const points = velocityData
      .map((value, index) => {
        const x = 20 + (index / (velocityData.length - 1)) * 260;
        const y = 80 - (value / 0.4) * 60;
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <Svg width={300} height={100}>
        <Line x1={20} y1={80} x2={280} y2={80} stroke="#333" strokeWidth="1" />
        <Polyline points={points} fill="none" stroke="#4CAF50" strokeWidth="3" />
        {velocityData.map((value, index) => {
          const x = 20 + (index / (velocityData.length - 1)) * 260;
          const y = 80 - (value / 0.4) * 60;
          return <Circle key={index} cx={x} cy={y} r="4" fill="#4CAF50" />;
        })}
      </Svg>
    );
  };

  const renderBarPath = () => {
    const pathString = barPathData
      .map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');

    return (
      <Svg width={100} height={120}>
        <Line x1={50} y1={0} x2={50} y2={120} stroke="#333" strokeWidth="1" strokeDasharray="5,5" />
        <Path d={pathString} fill="none" stroke="#2196F3" strokeWidth="3" />
        {barPathData.map((point, index) => (
          <Circle key={index} cx={point.x} cy={point.y} r="3" fill="#2196F3" />
        ))}
      </Svg>
    );
  };

  const Field = ({ label, value }) => (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );

  const DeviceField = ({ label, value }) => (
    <View style={styles.deviceRow}>
      <Text style={styles.deviceLabel}>{label}</Text>
      <Text style={styles.deviceValue}>{value ?? '—'}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBackToDashboard}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Session Summary</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Main Stats */}
        <View style={styles.mainStatsCard}>
          <View style={styles.statRow}>
            <View style={styles.mainStat}>
              <Text style={styles.mainStatValue}>{totalReps}</Text>
              <Text style={styles.mainStatLabel}>REPS</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.mainStat}>
              <Text style={styles.mainStatValue}>{formatDuration(durationSec)}</Text>
              <Text style={styles.mainStatLabel}>TIME</Text>
            </View>
          </View>
        </View>

        {/* Session Details (must-have) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🧾 Session Details</Text>
          <View style={styles.card}>
            <Field label="Start" value={formatClock(startTime)} />
            <Field label="End" value={formatClock(endTime)} />
            <Field label="Duration" value={`${durationSec} sec`} />
            <Field label="Avg Rep Time" value={`${Number(avgRepTime).toFixed(2)} sec`} />
            <Field label="Time Under Tension" value={`${tutSec} sec`} />
          </View>
        </View>

        {/* Velocity Section (placeholder ok) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🚀 Velocity Analysis</Text>
          <View style={styles.card}>
            <Field label="Average Velocity" value="— (coming soon)" />
            <Field label="Peak Velocity" value="— (coming soon)" />
            <Field label="Velocity Loss" value="—" />
          </View>

          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Velocity per Rep (placeholder)</Text>
            {renderVelocityChart()}
            <Text style={styles.chartNote}>Charts will update when you compute per-rep metrics</Text>
          </View>
        </View>

        {/* Bar Path (placeholder ok) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Bar Path Analysis</Text>
          <View style={styles.barPathCard}>
            <View style={styles.barPathViz}>{renderBarPath()}</View>
            <View style={styles.barPathMetrics}>
              <View style={styles.pathMetric}>
                <Text style={styles.pathLabel}>Horizontal Drift</Text>
                <Text style={styles.pathValue}>—</Text>
                <Text style={styles.pathStatus}>Pending</Text>
              </View>
              <View style={styles.pathMetric}>
                <Text style={styles.pathLabel}>Vertical Efficiency</Text>
                <Text style={styles.pathValue}>—</Text>
                <Text style={styles.pathStatus}>Pending</Text>
              </View>
              <View style={styles.pathMetric}>
                <Text style={styles.pathLabel}>Arc Angle</Text>
                <Text style={styles.pathValue}>—</Text>
                <Text style={styles.pathStatus}>Pending</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Device + Thresholds (must-have) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🧠 Device & Thresholds</Text>

          <View style={styles.card}>
            <Text style={styles.subHeader}>Device Info</Text>
            <View style={styles.deviceBlock}>
              <DeviceField label="Pi Model" value={device.pi_model} />
              <DeviceField label="IMU" value={device.imu} />
              <DeviceField label="I2C Bus" value={device.i2c_bus} />
              <DeviceField label="IMU Addr" value={device.imu_addr} />
              <DeviceField label="Sample Rate" value={device.sample_rate_hz ? `${device.sample_rate_hz} Hz` : '—'} />
            </View>

            <Text style={[styles.subHeader, { marginTop: 14 }]}>Thresholds</Text>
            <View style={styles.deviceBlock}>
              <DeviceField label="rep_start" value={thresholds.rep_start} />
              <DeviceField label="rep_end" value={thresholds.rep_end} />
              <DeviceField label="min_rep_gap_ms" value={thresholds.min_rep_gap_ms} />
              <DeviceField label="filter" value={thresholds.filter} />
              <DeviceField label="ema_alpha" value={thresholds.ema_alpha} />
            </View>
          </View>
        </View>

        {/* AI Coaching (placeholder ok) */}
        <View style={styles.coachingCard}>
          <Text style={styles.coachingTitle}>🤖 Coaching Feedback</Text>
          <View style={styles.coachingPoint}>
            <Text style={styles.coachingBullet}>•</Text>
            <Text style={styles.coachingText}>Summary is saved. Add velocity + ROM later.</Text>
          </View>
          <View style={styles.coachingPoint}>
            <Text style={styles.coachingBullet}>•</Text>
            <Text style={styles.coachingText}>
              Hardware note: if you see “imu_read I/O error”, check I2C wiring/power.
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <TouchableOpacity style={styles.historyButton} onPress={onViewHistory}>
          <Text style={styles.historyButtonText}>View History</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton2} onPress={onBackToDashboard}>
          <Text style={styles.backButtonText2}>Back to Dashboard</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  backButton: { fontSize: 28, color: '#fff' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  scrollContent: { padding: 20 },

  mainStatsCard: { backgroundColor: '#1a1a1a', borderRadius: 20, padding: 24, marginBottom: 24 },
  statRow: { flexDirection: 'row', alignItems: 'center' },
  mainStat: { flex: 1, alignItems: 'center' },
  mainStatValue: { fontSize: 48, fontWeight: 'bold', color: '#4CAF50' },
  mainStatLabel: { fontSize: 12, color: '#888', letterSpacing: 2, marginTop: 4 },
  divider: { width: 1, height: 60, backgroundColor: '#333' },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 12 },

  card: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16 },

  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  metricLabel: { fontSize: 14, color: '#888' },
  metricValue: { fontSize: 16, fontWeight: 'bold', color: '#fff' },

  chartCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    alignItems: 'center',
  },
  chartTitle: { fontSize: 14, color: '#888', marginBottom: 16 },
  chartNote: { fontSize: 12, color: '#666', marginTop: 12, textAlign: 'center' },

  barPathCard: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, flexDirection: 'row' },
  barPathViz: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  barPathMetrics: { flex: 2, paddingLeft: 16 },
  pathMetric: { marginBottom: 16 },
  pathLabel: { fontSize: 12, color: '#888' },
  pathValue: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginTop: 2 },
  pathStatus: { fontSize: 12, color: '#888', marginTop: 2 },

  subHeader: { color: '#fff', fontWeight: '800', marginBottom: 10, fontSize: 14 },
  deviceBlock: {
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 10,
    padding: 12,
  },
  deviceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  deviceLabel: { color: '#888', fontSize: 13 },
  deviceValue: { color: '#fff', fontSize: 13, fontWeight: '700' },

  coachingCard: {
    backgroundColor: '#1a3a1a',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
    marginBottom: 24,
  },
  coachingTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  coachingPoint: { flexDirection: 'row', marginBottom: 12 },
  coachingBullet: { color: '#4CAF50', fontSize: 16, marginRight: 8 },
  coachingText: { fontSize: 14, color: '#aaa', flex: 1, lineHeight: 20 },

  historyButton: { backgroundColor: '#2196F3', borderRadius: 12, padding: 18, alignItems: 'center', marginBottom: 12 },
  historyButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  backButton2: { backgroundColor: '#333', borderRadius: 12, padding: 18, alignItems: 'center' },
  backButtonText2: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
