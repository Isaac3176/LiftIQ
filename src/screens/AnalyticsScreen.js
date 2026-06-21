import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, StatusBar, Animated, Easing } from 'react-native';
import Svg, { Line, Polyline, Circle } from 'react-native-svg';
import { theme } from '../theme/performanceLabTheme';

export default function AnalyticsScreen({ history, onBack }) {
  const glowAnim = useRef(new Animated.Value(0.65)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.65,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glowAnim]);

  const velocityTrend = useMemo(() => history.map((h) => h.avgVelocity).filter((v) => v != null).reverse(), [history]);
  const repsTrend = useMemo(() => history.map((h) => h.reps).filter((v) => v != null).reverse(), [history]);

  const avgVelocity = velocityTrend.length
    ? velocityTrend.reduce((a, b) => a + b, 0) / velocityTrend.length
    : 0;
  const avgReps = repsTrend.length
    ? Math.round(repsTrend.reduce((a, b) => a + b, 0) / repsTrend.length)
    : 0;

  const renderTrendChart = (data, color, label) => {
    if (data.length < 2) {
      return (
        <View style={styles.chartCard}>
          <Text style={styles.chartLabel}>{label}</Text>
          <Text style={styles.emptyText}>Need at least two sessions for trend analysis.</Text>
        </View>
      );
    }

    const maxValue = Math.max(...data);
    const minValue = Math.min(...data);
    const range = maxValue - minValue || 1;

    const points = data.map((value, index) => {
      const x = 30 + (index / (data.length - 1)) * 240;
      const y = 80 - ((value - minValue) / range) * 60;
      return `${x},${y}`;
    }).join(' ');

    return (
      <View style={styles.chartCard}>
        <Text style={styles.chartLabel}>{label}</Text>
        <Svg width={300} height={100}>
          <Line x1={30} y1={80} x2={270} y2={80} stroke={theme.colors.border} strokeWidth="1" />
          <Polyline points={points} fill="none" stroke={color} strokeWidth="2.2" />
          {data.map((value, index) => {
            const x = 30 + (index / (data.length - 1)) * 240;
            const y = 80 - ((value - minValue) / range) * 60;
            return <Circle key={index} cx={x} cy={y} r="3" fill={color} />;
          })}
        </Svg>
        <View style={styles.chartLegend}>
          <Text style={styles.legendText}>Min: {minValue.toFixed(2)}</Text>
          <Text style={styles.legendText}>Max: {maxValue.toFixed(2)}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analytics</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>Performance Overview</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{avgVelocity.toFixed(2)}</Text>
              <Text style={styles.summaryLabel}>Avg Velocity</Text>
              <Text style={styles.summaryChange}>+8% weekly trend</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{avgReps}</Text>
              <Text style={styles.summaryLabel}>Avg Reps</Text>
              <Text style={styles.summaryChange}>+2 weekly trend</Text>
            </View>
          </View>
        </View>

        {renderTrendChart(velocityTrend, theme.colors.accent, 'Velocity Trend (m/s)')}
        {renderTrendChart(repsTrend, theme.colors.success, 'Reps Per Session')}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Strength Metrics</Text>
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Text style={styles.metricName}>Estimated 1RM Progress</Text>
              <Text style={styles.metricTrend}>+12%</Text>
            </View>
            <Text style={styles.metricValue}>185 lbs</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: '75%' }]} />
            </View>
            <Text style={styles.metricNote}>Goal: 200 lbs</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Records</Text>
          <Animated.View style={[styles.prCard, { opacity: glowAnim, borderColor: theme.colors.accent }]}>
            <Text style={styles.prTitle}>PR Velocity</Text>
            <Text style={styles.prValue}>0.35 m/s</Text>
            <Text style={styles.prDate}>Dec 20, 2025</Text>
          </Animated.View>
          <View style={styles.prCard}>
            <Text style={styles.prTitle}>Most Reps</Text>
            <Text style={styles.prValue}>12 reps</Text>
            <Text style={styles.prDate}>Dec 18, 2025</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    padding: 20,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  scrollContent: {
    padding: 20,
  },
  summarySection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 34,
    fontWeight: '800',
    color: theme.colors.accent,
  },
  summaryLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  summaryChange: {
    fontSize: 11,
    color: theme.colors.success,
    marginTop: 4,
  },
  chartCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chartLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
  },
  legendText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  section: {
    marginBottom: 24,
  },
  metricCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metricName: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  metricTrend: {
    fontSize: 14,
    color: theme.colors.success,
    fontWeight: '700',
  },
  metricValue: {
    fontSize: 30,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.accent,
    borderRadius: 4,
  },
  metricNote: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  prCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  prTitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  prValue: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  prDate: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    paddingVertical: 18,
  },
});

