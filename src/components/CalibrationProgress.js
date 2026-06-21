import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme/performanceLabTheme';

export default function CalibrationProgress({ status }) {
  const points = Math.max(0, Math.min(5, status?.points || 0));

  const getStatusColor = () => {
    switch (status?.status) {
      case 'excellent':
        return theme.colors.success;
      case 'good':
        return '#8BC34A';
      case 'basic':
        return theme.colors.warning;
      case 'insufficient':
        return '#FF9800';
      default:
        return theme.colors.textMuted;
    }
  };

  const statusColor = getStatusColor();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>Calibration</Text>
        <Text style={[styles.message, { color: statusColor }]}>{status?.message || 'No calibration data'}</Text>
      </View>
      <View style={styles.dots}>
        {[0, 1, 2, 3, 4].map((index) => (
          <View key={index} style={[styles.dot, index < points && { backgroundColor: statusColor }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  message: {
    fontSize: 12,
    fontWeight: '600',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: theme.colors.bgElevated,
  },
});
