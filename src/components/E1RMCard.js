import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme/performanceLabTheme';

export default function E1RMCard({ e1rmData, weightUnit = 'lb' }) {
  if (!e1rmData) {
    return (
      <View style={styles.card}>
        <Text style={styles.label}>ESTIMATED 1RM</Text>
        <Text style={styles.uncalibrated}>Not yet calibrated</Text>
        <Text style={styles.hint}>Complete 2-3 sets at different loads to calibrate.</Text>
      </View>
    );
  }

  const { e1rm, confidence = 0, dataPoints = 0, needsMoreData } = e1rmData;
  const confidenceColor = confidence >= 0.9 ? theme.colors.success : confidence >= 0.7 ? theme.colors.warning : '#FF9800';

  return (
    <View style={styles.card}>
      <Text style={styles.label}>ESTIMATED 1RM</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{e1rm}</Text>
        <Text style={styles.unit}>{weightUnit}</Text>
      </View>

      <View style={styles.confidenceRow}>
        <View style={styles.confidenceTrack}>
          <View style={[styles.confidenceFill, { width: `${Math.max(0, Math.min(100, confidence * 100))}%`, backgroundColor: confidenceColor }]} />
        </View>
        <Text style={[styles.confidenceText, { color: confidenceColor }]}>{Math.round(confidence * 100)}% confidence</Text>
      </View>

      <Text style={styles.status}>
        Based on {dataPoints} data point{dataPoints === 1 ? '' : 's'}
        {needsMoreData ? ' - add more sets for better accuracy' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  uncalibrated: {
    color: theme.colors.textSecondary,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  value: {
    color: theme.colors.textPrimary,
    fontSize: 48,
    fontWeight: '800',
    lineHeight: 52,
  },
  unit: {
    color: theme.colors.textMuted,
    fontSize: 22,
    marginLeft: 8,
    fontWeight: '600',
  },
  confidenceRow: {
    marginBottom: 8,
  },
  confidenceTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
    marginBottom: 6,
  },
  confidenceFill: {
    height: '100%',
    borderRadius: 999,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: '700',
  },
  status: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
});
