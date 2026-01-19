import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import Svg, { Circle, Line, Polyline, Path, Rect, Text as SvgText } from 'react-native-svg';

export default function SessionSummaryScreen({ sessionData, onViewHistory, onBackToDashboard }) {
  // Get peak gyro data from server summary or fallback to rep events
  const serverSummary = sessionData?.serverSummary;
  const peakGyroPerRep = serverSummary?.peakGyroPerRep || sessionData?.peakGyroFromEvents || [];
  const outputLossPct = serverSummary?.outputLossPct ?? null;

  // Placeholder velocity data (existing)
  const velocityData = [0.32, 0.31, 0.29, 0.28, 0.26, 0.24, 0.22, 0.20];
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

  // Get fatigue interpretation based on output loss percentage
  const getFatigueInterpretation = (lossPct) => {
    if (lossPct === null || lossPct === undefined) {
      return { level: 'Unknown', color: '#888', message: 'Not enough data to calculate fatigue' };
    }
    if (lossPct < 10) {
      return { level: 'Strong Endurance', color: '#4CAF50', message: 'Excellent output consistency. You maintained power throughout the set.' };
    }
    if (lossPct <= 20) {
      return { level: 'Normal Fatigue', color: '#FFC107', message: 'Typical fatigue pattern. Good set intensity.' };
    }
    return { level: 'High Fatigue', color: '#ff4444', message: 'Significant output drop detected. Consider reducing volume or stopping earlier next set.' };
  };

  const fatigueInfo = getFatigueInterpretation(outputLossPct);

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

  // NEW: Render Peak Gyro Per Rep Chart
  const renderPeakGyroChart = () => {
    if (!peakGyroPerRep || peakGyroPerRep.length === 0) {
      return (
        <View style={styles.noDataContainer}>
          <Text style={styles.noDataText}>No peak output data available</Text>
        </View>
      );
    }

    const maxValue = Math.max(...peakGyroPerRep);
    const minValue = Math.min(...peakGyroPerRep);
    const padding = (maxValue - minValue) * 0.1 || 100;
    const chartMax = maxValue + padding;
    const chartMin = Math.max(0, minValue - padding);
    const range = chartMax - chartMin || 1;

    const chartWidth = 300;
    const chartHeight = 120;
    const leftPadding = 45;
    const rightPadding = 15;
    const topPadding = 10;
    const bottomPadding = 25;
    const plotWidth = chartWidth - leftPadding - rightPadding;
    const plotHeight = chartHeight - topPadding - bottomPadding;

    const barWidth = Math.max(16, Math.min(35, plotWidth / peakGyroPerRep.length - 6));
    const barSpacing = (plotWidth - barWidth * peakGyroPerRep.length) / (peakGyroPerRep.length + 1);

    return (
      <Svg width={chartWidth} height={chartHeight}>
        {/* Y-axis line */}
        <Line 
          x1={leftPadding} 
          y1={topPadding} 
          x2={leftPadding} 
          y2={chartHeight - bottomPadding} 
          stroke="#333" 
          strokeWidth="1" 
        />
        {/* X-axis line */}
        <Line 
          x1={leftPadding} 
          y1={chartHeight - bottomPadding} 
          x2={chartWidth - rightPadding} 
          y2={chartHeight - bottomPadding} 
          stroke="#333" 
          strokeWidth="1" 
        />

        {/* Y-axis labels */}
        <SvgText x={leftPadding - 5} y={topPadding + 4} fontSize="9" fill="#666" textAnchor="end">
          {chartMax.toFixed(0)}
        </SvgText>
        <SvgText x={leftPadding - 5} y={chartHeight - bottomPadding} fontSize="9" fill="#666" textAnchor="end">
          {chartMin.toFixed(0)}
        </SvgText>

        {/* Bars */}
        {peakGyroPerRep.map((value, index) => {
          const barHeight = Math.max(2, ((value - chartMin) / range) * plotHeight);
          const x = leftPadding + barSpacing + index * (barWidth + barSpacing);
          const y = chartHeight - bottomPadding - barHeight;
          
          // Color based on decline from first rep
          const firstValue = peakGyroPerRep[0];
          const declinePercent = firstValue > 0 ? ((firstValue - value) / firstValue) * 100 : 0;
          let barColor = '#4CAF50'; // Green = good
          if (declinePercent > 20) {
            barColor = '#ff4444'; // Red = high fatigue
          } else if (declinePercent > 10) {
            barColor = '#FFC107'; // Yellow = moderate fatigue
          }

          return (
            <React.Fragment key={index}>
              <Rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={barColor}
                rx={3}
              />
              {/* Rep number label */}
              <SvgText 
                x={x + barWidth / 2} 
                y={chartHeight - bottomPadding + 14} 
                fontSize="9" 
                fill="#888" 
                textAnchor="middle"
              >
                {index + 1}
              </SvgText>
            </React.Fragment>
          );
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
              <Text style={styles.mainStatValue}>{sessionData?.reps || 0}</Text>
              <Text style={styles.mainStatLabel}>REPS</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.mainStat}>
              <Text style={styles.mainStatValue}>{formatDuration(sessionData?.duration || 0)}</Text>
              <Text style={styles.mainStatLabel}>TIME</Text>
            </View>
          </View>
        </View>

        {/* ============================================ */}
        {/* NEW: Output / Fatigue (Proxy) Section       */}
        {/* ============================================ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚡ Output / Fatigue (Gyro Proxy)</Text>
          
          {/* Output Loss Card */}
          <View style={[styles.outputLossCard, { borderLeftColor: fatigueInfo.color }]}>
            <View style={styles.outputLossHeader}>
              <Text style={styles.outputLossLabel}>Output Loss (Proxy)</Text>
              <Text style={[styles.outputLossValue, { color: fatigueInfo.color }]}>
                {outputLossPct !== null ? `${outputLossPct.toFixed(1)}%` : 'N/A'}
              </Text>
            </View>
            <View style={styles.fatigueIndicatorContainer}>
              <View style={styles.fatigueIndicatorBg}>
                <View 
                  style={[
                    styles.fatigueIndicatorFill, 
                    { 
                      width: `${Math.min(100, Math.max(0, outputLossPct || 0) * 3.33)}%`,
                      backgroundColor: fatigueInfo.color 
                    }
                  ]} 
                />
              </View>
              <View style={styles.fatigueMarkers}>
                <Text style={styles.fatigueMarkerText}>0%</Text>
                <Text style={styles.fatigueMarkerText}>10%</Text>
                <Text style={styles.fatigueMarkerText}>20%</Text>
                <Text style={styles.fatigueMarkerText}>30%+</Text>
              </View>
            </View>
            <Text style={[styles.fatigueLevelText, { color: fatigueInfo.color }]}>
              {fatigueInfo.level}
            </Text>
            <Text style={styles.fatigueMessage}>{fatigueInfo.message}</Text>
          </View>

          {/* Peak Gyro Per Rep Chart */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Peak Output Per Rep</Text>
            {renderPeakGyroChart()}
            <Text style={styles.chartNote}>
              Rep 1-{peakGyroPerRep.length || '?'} • Higher = more explosive
            </Text>
            <Text style={styles.proxyDisclaimer}>
              ℹ️ Gyroscope-based proxy, not true bar velocity
            </Text>
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
          <Text style={styles.sectionTitle}>💪 Power Output</Text>
          
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
              <Text style={styles.metricValue}>
                {serverSummary?.tutSec ? `${serverSummary.tutSec.toFixed(1)} sec` : '42 sec'}
              </Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Avg Tempo</Text>
              <Text style={styles.metricValue}>
                {serverSummary?.avgTempoSec ? `${serverSummary.avgTempoSec.toFixed(2)} sec` : '2.1 sec'}
              </Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Avg Concentric</Text>
              <Text style={styles.metricValue}>1.2 sec</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Avg Eccentric</Text>
              <Text style={styles.metricValue}>2.1 sec</Text>
            </View>
          </View>
        </View>

        {/* Predicted 1RM */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎯 Estimated 1RM</Text>
          
          <View style={styles.e1rmCard}>
            <Text style={styles.e1rmValue}>185 lbs</Text>
            <Text style={styles.e1rmNote}>Based on velocity-based training formula</Text>
            <Text style={styles.e1rmChange}>+5 lbs from last week</Text>
          </View>
        </View>

        {/* AI Coaching - Dynamic based on output_loss_pct */}
        <View style={styles.coachingCard}>
          <Text style={styles.coachingTitle}>🤖 AI Coaching Feedback</Text>
          <View style={styles.coachingPoint}>
            <Text style={styles.coachingBullet}>•</Text>
            <Text style={styles.coachingText}>
              Great bar path! Keep that vertical efficiency above 95%.
            </Text>
          </View>
          {outputLossPct !== null && outputLossPct > 20 && (
            <View style={styles.coachingPoint}>
              <Text style={styles.coachingBullet}>•</Text>
              <Text style={styles.coachingText}>
                Your output dropped {outputLossPct.toFixed(0)}%. Consider stopping at 20% loss for strength gains.
              </Text>
            </View>
          )}
          {outputLossPct !== null && outputLossPct >= 10 && outputLossPct <= 20 && (
            <View style={styles.coachingPoint}>
              <Text style={styles.coachingBullet}>•</Text>
              <Text style={styles.coachingText}>
                Normal fatigue pattern ({outputLossPct.toFixed(0)}% drop). Good intensity for hypertrophy.
              </Text>
            </View>
          )}
          {outputLossPct !== null && outputLossPct < 10 && (
            <View style={styles.coachingPoint}>
              <Text style={styles.coachingBullet}>•</Text>
              <Text style={styles.coachingText}>
                Excellent output consistency! You could add more reps or weight next set.
              </Text>
            </View>
          )}
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
  proxyDisclaimer: {
    fontSize: 11,
    color: '#555',
    marginTop: 8,
    fontStyle: 'italic',
  },
  noDataContainer: {
    padding: 24,
    alignItems: 'center',
  },
  noDataText: {
    color: '#666',
    fontSize: 14,
  },
  // NEW: Output Loss Card styles
  outputLossCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 4,
    marginBottom: 12,
  },
  outputLossHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  outputLossLabel: {
    fontSize: 14,
    color: '#888',
  },
  outputLossValue: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  fatigueIndicatorContainer: {
    marginBottom: 12,
  },
  fatigueIndicatorBg: {
    height: 12,
    backgroundColor: '#222',
    borderRadius: 6,
    overflow: 'hidden',
  },
  fatigueIndicatorFill: {
    height: '100%',
    borderRadius: 6,
  },
  fatigueMarkers: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  fatigueMarkerText: {
    fontSize: 10,
    color: '#555',
  },
  fatigueLevelText: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  fatigueMessage: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    lineHeight: 18,
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