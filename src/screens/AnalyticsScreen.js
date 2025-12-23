import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import Svg, { Line, Polyline, Circle } from 'react-native-svg';

export default function AnalyticsScreen({ history, onBack }) {
  // Generate trend data from history
  const velocityTrend = history.map(h => h.avgVelocity).reverse();
  const repsTrend = history.map(h => h.reps).reverse();

  const renderTrendChart = (data, color, label) => {
    if (data.length === 0) return null;

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
          <Line x1={30} y1={80} x2={270} y2={80} stroke="#333" strokeWidth="1" />
          <Polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="2"
          />
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
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analytics</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Performance Summary */}
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>📊 Performance Overview</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>
                {(velocityTrend.reduce((a, b) => a + b, 0) / velocityTrend.length).toFixed(2)}
              </Text>
              <Text style={styles.summaryLabel}>Avg Velocity</Text>
              <Text style={styles.summaryChange}>+8% this week</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>
                {Math.floor(repsTrend.reduce((a, b) => a + b, 0) / repsTrend.length)}
              </Text>
              <Text style={styles.summaryLabel}>Avg Reps</Text>
              <Text style={styles.summaryChange}>+2 from last week</Text>
            </View>
          </View>
        </View>

        {/* Velocity Trend */}
        {renderTrendChart(velocityTrend, '#4CAF50', 'Velocity Trend (m/s)')}

        {/* Reps Trend */}
        {renderTrendChart(repsTrend, '#2196F3', 'Reps per Session')}

        {/* Strength Metrics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💪 Strength Metrics</Text>
          
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Text style={styles.metricName}>Estimated 1RM Progress</Text>
              <Text style={styles.metricTrend}>↗ +12%</Text>
            </View>
            <Text style={styles.metricValue}>185 lbs</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: '75%' }]} />
            </View>
            <Text style={styles.metricNote}>Goal: 200 lbs</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Text style={styles.metricName}>Power Output</Text>
              <Text style={styles.metricTrend}>↗ +8%</Text>
            </View>
            <Text style={styles.metricValue}>425 W</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: '65%', backgroundColor: '#2196F3' }]} />
            </View>
            <Text style={styles.metricNote}>Elite: 500+ W</Text>
          </View>
        </View>

        {/* Form Quality */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>✓ Form Quality</Text>
          
          <View style={styles.qualityCard}>
            <View style={styles.qualityItem}>
              <Text style={styles.qualityLabel}>Bar Path Efficiency</Text>
              <View style={styles.qualityBar}>
                <View style={[styles.qualityFill, { width: '96%' }]} />
              </View>
              <Text style={styles.qualityScore}>96%</Text>
            </View>

            <View style={styles.qualityItem}>
              <Text style={styles.qualityLabel}>ROM Consistency</Text>
              <View style={styles.qualityBar}>
                <View style={[styles.qualityFill, { width: '94%' }]} />
              </View>
              <Text style={styles.qualityScore}>94%</Text>
            </View>

            <View style={styles.qualityItem}>
              <Text style={styles.qualityLabel}>Tempo Control</Text>
              <View style={styles.qualityBar}>
                <View style={[styles.qualityFill, { width: '89%' }]} />
              </View>
              <Text style={styles.qualityScore}>89%</Text>
            </View>
          </View>
        </View>

        {/* Personal Records */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏆 Personal Records</Text>
          
          <View style={styles.prCard}>
            <Text style={styles.prTitle}>Best Velocity</Text>
            <Text style={styles.prValue}>0.35 m/s</Text>
            <Text style={styles.prDate}>Dec 20, 2025</Text>
          </View>

          <View style={styles.prCard}>
            <Text style={styles.prTitle}>Most Reps</Text>
            <Text style={styles.prValue}>12 reps</Text>
            <Text style={styles.prDate}>Dec 18, 2025</Text>
          </View>

          <View style={styles.prCard}>
            <Text style={styles.prTitle}>Peak Power</Text>
            <Text style={styles.prValue}>478 W</Text>
            <Text style={styles.prDate}>Dec 21, 2025</Text>
          </View>
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
  summarySection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  summaryChange: {
    fontSize: 11,
    color: '#4CAF50',
    marginTop: 4,
  },
  chartCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  chartLabel: {
    fontSize: 14,
    color: '#888',
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
    color: '#666',
  },
  section: {
    marginBottom: 24,
  },
  metricCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metricName: {
    fontSize: 14,
    color: '#888',
  },
  metricTrend: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  metricValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#222',
    borderRadius: 4,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  metricNote: {
    fontSize: 12,
    color: '#666',
  },
  qualityCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  qualityItem: {
    marginBottom: 16,
  },
  qualityLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  qualityBar: {
    height: 24,
    backgroundColor: '#222',
    borderRadius: 12,
    marginBottom: 4,
  },
  qualityFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 12,
  },
  qualityScore: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
    textAlign: 'right',
  },
  prCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prTitle: {
    fontSize: 14,
    color: '#888',
  },
  prValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  prDate: {
    fontSize: 12,
    color: '#666',
  },
});