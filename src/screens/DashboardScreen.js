import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { theme } from '../theme/performanceLabTheme';

export default function DashboardScreen({ onStartWorkout, onNavigate, onDisconnect, recentSession }) {
  const chartData = [8, 12, 10, 15, 11, 9, 14, 16, 13, 11];
  const repsToday = recentSession?.reps || 10;
  const avgVelocity = recentSession?.avgVelocity || 0.32;

  const renderMiniChart = () => {
    const points = chartData.map((value, index) => {
      const x = 10 + (index / (chartData.length - 1)) * 80;
      const y = 40 - (value / 20) * 30;
      return `${x},${y}`;
    }).join(' ');

    return (
      <Svg width={100} height={50}>
        <Polyline points={points} fill="none" stroke={theme.colors.accent} strokeWidth="2.2" />
      </Svg>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Performance Lab</Text>
          <Text style={styles.subGreeting}>Real-time velocity coaching</Text>
        </View>
        <TouchableOpacity onPress={onDisconnect} style={styles.disconnectBtn}>
          <Text style={styles.disconnectText}>Exit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <Text style={styles.sectionTitle}>Today</Text>
          <View style={styles.bigStatContainer}>
            <Text style={styles.bigNumber}>{repsToday}</Text>
            <Text style={styles.bigLabel}>TOTAL REPS</Text>
          </View>

          <View style={styles.miniChartContainer}>{renderMiniChart()}</View>

          <View style={styles.statsRow}>
            <View style={styles.miniStat}>
              <Text style={styles.miniStatLabel}>ACTIVE SET</Text>
              <Text style={styles.miniStatValue}>{recentSession?.sets || 3}</Text>
            </View>
            <View style={styles.miniStat}>
              <Text style={styles.miniStatLabel}>AVG VELOCITY</Text>
              <Text style={styles.miniStatValue}>{avgVelocity.toFixed(2)} m/s</Text>
            </View>
          </View>
        </View>

        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.actionButton} onPress={onStartWorkout}>
            <Text style={styles.actionText}>Start Session</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => onNavigate('history')}>
            <Text style={styles.actionText}>History</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => onNavigate('analytics')}>
            <Text style={styles.actionText}>Analytics</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.metricsContainer}>
          <Text style={styles.sectionTitle}>Velocity Focus</Text>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Peak Velocity</Text>
            <Text style={styles.metricValue}>0.45 m/s</Text>
            <Text style={styles.metricChange}>+5% from last week</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Average Power</Text>
            <Text style={styles.metricValue}>425 W</Text>
            <Text style={styles.metricChange}>+12% from last week</Text>
          </View>
        </View>

        <View style={styles.coachingCard}>
          <Text style={styles.coachingTitle}>AI Insight</Text>
          <Text style={styles.coachingText}>
            Velocity drops around rep 6. Stop one rep earlier to keep output quality high.
          </Text>
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
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  subGreeting: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  disconnectBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
  },
  disconnectText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 20,
  },
  heroCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 24,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  bigStatContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  bigNumber: {
    fontSize: 72,
    fontWeight: '800',
    color: theme.colors.accent,
  },
  bigLabel: {
    fontSize: 12,
    color: theme.colors.textMuted,
    letterSpacing: 2,
  },
  miniChartContainer: {
    alignItems: 'center',
    marginVertical: 14,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  miniStat: {
    alignItems: 'center',
  },
  miniStatLabel: {
    fontSize: 10,
    color: theme.colors.textMuted,
    letterSpacing: 1,
    marginBottom: 4,
  },
  miniStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8,
  },
  actionButton: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 18,
    alignItems: 'center',
    flex: 1,
  },
  actionText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  metricsContainer: {
    marginBottom: 20,
  },
  metricCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    marginBottom: 12,
  },
  metricLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  metricChange: {
    fontSize: 12,
    color: theme.colors.success,
  },
  coachingCard: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 20,
    marginBottom: 8,
  },
  coachingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.accent,
    marginBottom: 8,
  },
  coachingText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
});

