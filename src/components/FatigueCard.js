import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme/performanceLabTheme';

export default function FatigueCard({ velocityLossPct, fatigueColor, recommendation, fatigueLevel }) {
  if (!Number.isFinite(velocityLossPct) || velocityLossPct <= 0) {
    return null;
  }

  const badgeLabel = fatigueLevel ? fatigueLevel.replace('_', ' ').toUpperCase() : 'FATIGUE';
  const progressWidth = `${Math.min(100, velocityLossPct * 2.5)}%`;

  return (
    <View style={[styles.card, { borderColor: fatigueColor || theme.colors.warning }]}>
      <View style={styles.header}>
        <Text style={styles.label}>VELOCITY LOSS</Text>
        <Text style={[styles.badge, { color: fatigueColor || theme.colors.warning }]}>{badgeLabel}</Text>
      </View>

      <Text style={[styles.percent, { color: fatigueColor || theme.colors.warning }]}>{velocityLossPct.toFixed(1)}%</Text>

      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: progressWidth, backgroundColor: fatigueColor || theme.colors.warning }]} />
        </View>
        <View style={[styles.marker, styles.marker25]} />
        <View style={[styles.marker, styles.marker50]} />
        <View style={[styles.marker, styles.marker75]} />
      </View>

      <Text style={[styles.recommendation, { color: fatigueColor || theme.colors.textSecondary }]}>{recommendation}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  percent: {
    fontSize: 34,
    fontWeight: '800',
    marginTop: 6,
    marginBottom: 12,
  },
  progressWrap: {
    position: 'relative',
    marginBottom: 10,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  marker: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: 8,
    backgroundColor: theme.colors.border,
  },
  marker25: {
    left: '25%',
  },
  marker50: {
    left: '50%',
  },
  marker75: {
    left: '75%',
  },
  recommendation: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
