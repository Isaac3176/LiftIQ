import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';

export default function DashboardScreen({ onStartWorkout, onNavigate, onDisconnect, recentSession }) {
  // Placeholder chart data
  const chartData = [8, 12, 10, 15, 11, 9, 14, 16, 13, 11];

  const renderMiniChart = () => {
    const points = chartData.map((value, index) => {
      const x = 10 + (index / (chartData.length - 1)) * 80;
      const y = 40 - (value / 20) * 30;
      return `${x},${y}`;
    }).join(' ');

    return (
      <Svg width={100} height={50}>
        <Polyline
          points={points}
          fill="none"
          stroke="#4CAF50"
          strokeWidth="2"
        />
      </Svg>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Dashboard</Text>
          <Text style={styles.subGreeting}>Ready to lift</Text>
        </View>
        <TouchableOpacity onPress={onDisconnect} style={styles.disconnectBtn}>
          <Text style={styles.disconnectText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Today's Stats */}
        <View style={styles.todayCard}>
          <Text style={styles.sectionTitle}>Today's Session</Text>
          <View style={styles.bigStatContainer}>
            <Text style={styles.bigNumber}>{recentSession?.reps || 10}</Text>
            <Text style={styles.bigLabel}>REPS</Text>
          </View>
          
          <View style={styles.miniChartContainer}>
            {renderMiniChart()}
          </View>

          <View style={styles.statsRow}>
            <View style={styles.miniStat}>
              <Text style={styles.miniStatLabel}>SET 3</Text>
              <Text style={styles.miniStatValue}>{recentSession?.sets || 3}</Text>
            </View>
            <View style={styles.miniStat}>
              <Text style={styles.miniStatLabel}>AVG VELOCITY</Text>
              <Text style={styles.miniStatValue}>{recentSession?.avgVelocity.toFixed(2)} m/s</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.finishButton}>
            <Text style={styles.finishButtonText}>Finish</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={onStartWorkout}
          >
            <Text style={styles.actionIcon}>🏋️</Text>
            <Text style={styles.actionText}>Start Workout</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => onNavigate('history')}
          >
            <Text style={styles.actionIcon}>📊</Text>
            <Text style={styles.actionText}>History</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => onNavigate('analytics')}
          >
            <Text style={styles.actionIcon}>📈</Text>
            <Text style={styles.actionText}>Analytics</Text>
          </TouchableOpacity>
        </View>

        {/* Key Metrics */}
        <View style={styles.metricsContainer}>
          <Text style={styles.sectionTitle}>Key Metrics</Text>
          
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

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Range of Motion</Text>
            <Text style={styles.metricValue}>94%</Text>
            <Text style={styles.metricChange}>Excellent form</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Est. 1RM</Text>
            <Text style={styles.metricValue}>185 lbs</Text>
            <Text style={styles.metricChange}>Based on velocity</Text>
          </View>
        </View>

        {/* AI Coaching Insight */}
        <View style={styles.coachingCard}>
          <Text style={styles.coachingTitle}>💡 AI Insight</Text>
          <Text style={styles.coachingText}>
            Your velocity is dropping 15% by rep 6. Consider ending sets earlier for better strength gains.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subGreeting: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
  disconnectBtn: {
    padding: 8,
  },
  disconnectText: {
    fontSize: 24,
  },
  scrollContent: {
    padding: 20,
  },
  todayCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  bigStatContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  bigNumber: {
    fontSize: 72,
    fontWeight: 'bold',
    color: '#fff',
  },
  bigLabel: {
    fontSize: 14,
    color: '#888',
    letterSpacing: 2,
  },
  miniChartContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    marginBottom: 20,
  },
  miniStat: {
    alignItems: 'center',
  },
  miniStatLabel: {
    fontSize: 10,
    color: '#888',
    letterSpacing: 1,
    marginBottom: 4,
  },
  miniStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  finishButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  finishButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  actionButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
  },
  actionIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  metricsContainer: {
    marginBottom: 20,
  },
  metricCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  metricLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  metricChange: {
    fontSize: 12,
    color: '#4CAF50',
  },
  coachingCard: {
    backgroundColor: '#1a3a1a',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  coachingTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  coachingText: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
  },
});