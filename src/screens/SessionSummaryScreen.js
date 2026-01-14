import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import Svg, { Circle, Line, Polyline, Path } from 'react-native-svg';

export default function SessionSummaryScreen({ sessionData, onViewHistory, onBackToDashboard }) {
  // Placeholder data
  const velocityData = [0.32, 0.31, 0.29, 0.28, 0.26, 0.24, 0.22, 0.20];
  const powerData = [450, 445, 430, 415, 400, 380, 360, 340];
  const barPathData = [
    { x: 50, y: 100 },
    { x: 52, y: 80 },
    { x: 50, y: 60 },
    { x: 48, y: 40 },
    { x: 50, y: 20 }
  ];

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderVelocityChart = () => {
    const points = velocityData.map((value, index) => {
      const x = 20 + (index / (velocityData.length - 1)) * 260;
      const y = 80 - (value / 0.4) * 60;
      return `${x},${y}`;
    }).join(' ');

    return (
      <Svg width={300} height={100}>
        <Line x1={20} y1={80} x2={280} y2={80} stroke="#333" strokeWidth="1" />
        <Polyline
          points={points}
          fill="none"
          stroke="#4CAF50"
          strokeWidth="3"
        />
        {velocityData.map((value, index) => {
          const x = 20 + (index / (velocityData.length - 1)) * 260;
          const y = 80 - (value / 0.4) * 60;
          return <Circle key={index} cx={x} cy={y} r="4" fill="#4CAF50" />;
        })}
      </Svg>
    );
  };

  const renderBarPath = () => {
    const pathString = barPathData.map((point, i) => 
      `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
    ).join(' ');

    return (
      <Svg width={100} height={120}>
        <Line x1={50} y1={0} x2={50} y2={120} stroke="#333" strokeWidth="1" strokeDasharray="5,5" />
        <Path
          d={pathString}
          fill="none"
          stroke="#2196F3"
          strokeWidth="3"
        />
        {barPathData.map((point, index) => (
          <Circle key={index} cx={point.x} cy={point.y} r="3" fill="#2196F3" />
        ))}
      </Svg>
    );
  };

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
              <Text style={styles.mainStatValue}>{sessionData?.reps || 3}</Text>
              <Text style={styles.mainStatLabel}>REPS</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.mainStat}>
              <Text style={styles.mainStatValue}>{formatDuration(sessionData?.duration || 368)}</Text>
              <Text style={styles.mainStatLabel}>TIME</Text>
            </View>
          </View>
        </View>

        {/* Velocity Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🚀 Velocity Analysis</Text>
          
          <View style={styles.card}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Average Velocity</Text>
              <Text style={styles.metricValue}>0.28 m/s</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Peak Velocity</Text>
              <Text style={styles.metricValue}>0.32 m/s</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Velocity Loss</Text>
              <Text style={[styles.metricValue, styles.warning]}>37.5%</Text>
            </View>
          </View>

          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Velocity per Rep</Text>
            {renderVelocityChart()}
            <Text style={styles.chartNote}>Rep 1-8 showing velocity decay</Text>
          </View>
        </View>

        {/* Power Output */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚡ Power Output</Text>
          
          <View style={styles.card}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Average Power</Text>
              <Text style={styles.metricValue}>405 W</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Peak Power</Text>
              <Text style={styles.metricValue}>450 W</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Power Drop</Text>
              <Text style={styles.metricValue}>24%</Text>
            </View>
          </View>
        </View>

        {/* Bar Path */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Bar Path Analysis</Text>
          
          <View style={styles.barPathCard}>
            <View style={styles.barPathViz}>
              {renderBarPath()}
            </View>
            <View style={styles.barPathMetrics}>
              <View style={styles.pathMetric}>
                <Text style={styles.pathLabel}>Horizontal Drift</Text>
                <Text style={styles.pathValue}>2.4 cm</Text>
                <Text style={styles.pathStatus}>✓ Good</Text>
              </View>
              <View style={styles.pathMetric}>
                <Text style={styles.pathLabel}>Vertical Efficiency</Text>
                <Text style={styles.pathValue}>96%</Text>
                <Text style={styles.pathStatus}>✓ Excellent</Text>
              </View>
              <View style={styles.pathMetric}>
                <Text style={styles.pathLabel}>Arc Angle</Text>
                <Text style={styles.pathValue}>8.2°</Text>
                <Text style={styles.pathStatus}>✓ Good</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ROM & Technique */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📏 Range of Motion</Text>
          
          <View style={styles.card}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Full ROM</Text>
              <Text style={styles.metricValue}>92%</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Depth Consistency</Text>
              <Text style={styles.metricValue}>94%</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Lockout Quality</Text>
              <Text style={styles.metricValue}>Excellent</Text>
            </View>
          </View>
        </View>

        {/* Tempo & TUT */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⏱️ Tempo & Time Under Tension</Text>
          
          <View style={styles.card}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Total TUT</Text>
              <Text style={styles.metricValue}>42 sec</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Avg Concentric</Text>
              <Text style={styles.metricValue}>1.2 sec</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Avg Eccentric</Text>
              <Text style={styles.metricValue}>2.1 sec</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Pause Time</Text>
              <Text style={styles.metricValue}>0.3 sec</Text>
            </View>
          </View>
        </View>

        {/* Fatigue Analysis */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>😰 Fatigue Detection</Text>
          
          <View style={[styles.card, styles.fatigueCard]}>
            <View style={styles.fatigueIndicator}>
              <View style={[styles.fatigueBar, { width: '70%', backgroundColor: '#FFC107' }]} />
            </View>
            <Text style={styles.fatigueLevel}>Medium Fatigue</Text>
            <Text style={styles.fatigueNote}>
              Velocity dropped 37% from first rep. Consider reducing volume next set.
            </Text>
          </View>
        </View>

        {/* Predicted 1RM */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💪 Estimated 1RM</Text>
          
          <View style={styles.e1rmCard}>
            <Text style={styles.e1rmValue}>185 lbs</Text>
            <Text style={styles.e1rmNote}>Based on velocity-based training formula</Text>
            <Text style={styles.e1rmChange}>+5 lbs from last week</Text>
          </View>
        </View>

        {/* AI Coaching */}
        <View style={styles.coachingCard}>
          <Text style={styles.coachingTitle}>🤖 AI Coaching Feedback</Text>
          <View style={styles.coachingPoint}>
            <Text style={styles.coachingBullet}>•</Text>
            <Text style={styles.coachingText}>
              Great bar path! Keep that vertical efficiency above 95%.
            </Text>
          </View>
          <View style={styles.coachingPoint}>
            <Text style={styles.coachingBullet}>•</Text>
            <Text style={styles.coachingText}>
              Your velocity is dropping significantly. End sets at 20% velocity loss for strength.
            </Text>
          </View>
          <View style={styles.coachingPoint}>
            <Text style={styles.coachingBullet}>•</Text>
            <Text style={styles.coachingText}>
              Consistent tempo! Your eccentric control is excellent for hypertrophy.
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <TouchableOpacity style={styles.historyButton} onPress={onViewHistory}>
          <Text style={styles.historyButtonText}>View History</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton2} onPress={onBackToDashboard}>
          <Text style={styles.backButtonText}>Back to Dashboard</Text>
        </TouchableOpacity>
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
  backButton: {
    fontSize: 28,
    color: '#fff',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  scrollContent: {
    padding: 20,
  },
  mainStatsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mainStat: {
    flex: 1,
    alignItems: 'center',
  },
  mainStatValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  mainStatLabel: {
    fontSize: 12,
    color: '#888',
    letterSpacing: 2,
    marginTop: 4,
  },
  divider: {
    width: 1,
    height: 60,
    backgroundColor: '#333',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  metricLabel: {
    fontSize: 14,
    color: '#888',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  warning: {
    color: '#FFC107',
  },
  chartCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    alignItems: 'center',
  },
  chartTitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
  },
  chartNote: {
    fontSize: 12,
    color: '#666',
    marginTop: 12,
  },
  barPathCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
  },
  barPathViz: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barPathMetrics: {
    flex: 2,
    paddingLeft: 16,
  },
  pathMetric: {
    marginBottom: 16,
  },
  pathLabel: {
    fontSize: 12,
    color: '#888',
  },
  pathValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 2,
  },
  pathStatus: {
    fontSize: 12,
    color: '#4CAF50',
    marginTop: 2,
  },
  fatigueCard: {
    alignItems: 'center',
  },
  fatigueIndicator: {
    width: '100%',
    height: 12,
    backgroundColor: '#222',
    borderRadius: 6,
    marginBottom: 12,
  },
  fatigueBar: {
    height: '100%',
    borderRadius: 6,
  },
  fatigueLevel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFC107',
    marginBottom: 8,
  },
  fatigueNote: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },
  e1rmCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  e1rmValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  e1rmNote: {
    fontSize: 13,
    color: '#888',
    marginTop: 8,
  },
  e1rmChange: {
    fontSize: 14,
    color: '#4CAF50',
    marginTop: 4,
  },
  coachingCard: {
    backgroundColor: '#1a3a1a',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
    marginBottom: 24,
  },
  coachingTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  coachingPoint: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  coachingBullet: {
    color: '#4CAF50',
    fontSize: 16,
    marginRight: 8,
  },
  coachingText: {
    fontSize: 14,
    color: '#aaa',
    flex: 1,
    lineHeight: 20,
  },
  historyButton: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  historyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton2: {
    backgroundColor: '#333',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});