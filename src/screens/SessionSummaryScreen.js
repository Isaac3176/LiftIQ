import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import Svg, { Circle, Line, Polyline, Path, Rect, Text as SvgText } from 'react-native-svg';

export default function SessionSummaryScreen({ sessionData, onViewHistory, onBackToDashboard }) {
  // Source of truth: server's session_summary
  const serverSummary = sessionData?.serverSummary;
  
  // Use server data if available
  const totalReps = serverSummary?.totalReps ?? sessionData?.reps ?? 0;
  const tutSec = serverSummary?.tutSec ?? null;
  const avgTempoSec = serverSummary?.avgTempoSec ?? null;
  const repTimesSec = serverSummary?.repTimesSec || [];
  const repBreakdown = serverSummary?.repBreakdown || [];
  const outputLossPct = serverSummary?.outputLossPct ?? null;
  const peakGyroPerRep = serverSummary?.peakGyroPerRep || [];
  const sessionId = serverSummary?.sessionId;

  // Calculate tempo stats from rep_times_sec (do NOT recompute avg - use server's)
  const fastestTempo = repTimesSec.length > 0 ? Math.min(...repTimesSec) : null;
  const slowestTempo = repTimesSec.length > 0 ? Math.max(...repTimesSec) : null;
  
  // Tempo consistency (standard deviation)
  const tempoStdDev = (() => {
    if (repTimesSec.length < 2) return null;
    const mean = repTimesSec.reduce((a, b) => a + b, 0) / repTimesSec.length;
    const squareDiffs = repTimesSec.map(t => Math.pow(t - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / repTimesSec.length;
    return Math.sqrt(avgSquareDiff);
  })();

  // Format helpers
  const formatValue = (value, decimals = 2, suffix = '') => {
    if (value == null || value === undefined) return '—';
    return `${Number(value).toFixed(decimals)}${suffix}`;
  };

  const formatDuration = (seconds) => {
    if (seconds == null) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Fatigue interpretation
  const getFatigueInfo = (lossPct) => {
    if (lossPct == null) return { level: 'Unknown', color: '#888', message: 'Not enough data' };
    if (lossPct < 10) return { level: 'Strong Endurance', color: '#4CAF50', message: 'Excellent output consistency' };
    if (lossPct <= 20) return { level: 'Normal Fatigue', color: '#FFC107', message: 'Typical fatigue pattern' };
    return { level: 'High Fatigue', color: '#ff4444', message: 'Consider reducing volume next set' };
  };
  const fatigueInfo = getFatigueInfo(outputLossPct);

  // Render Peak Gyro Chart
  const renderPeakGyroChart = () => {
    if (!peakGyroPerRep || peakGyroPerRep.length === 0) {
      return (
        <View style={styles.noDataContainer}>
          <Text style={styles.noDataText}>No peak output data</Text>
        </View>
      );
    }

    const maxValue = Math.max(...peakGyroPerRep);
    const minValue = Math.min(...peakGyroPerRep);
    const range = (maxValue - minValue) || 1;

    const chartWidth = 300;
    const chartHeight = 100;
    const leftPadding = 40;
    const bottomPadding = 20;
    const plotWidth = chartWidth - leftPadding - 10;
    const plotHeight = chartHeight - bottomPadding - 10;

    const barWidth = Math.max(14, Math.min(30, plotWidth / peakGyroPerRep.length - 4));
    const spacing = (plotWidth - barWidth * peakGyroPerRep.length) / (peakGyroPerRep.length + 1);

    return (
      <Svg width={chartWidth} height={chartHeight}>
        <Line x1={leftPadding} y1={chartHeight - bottomPadding} x2={chartWidth - 10} y2={chartHeight - bottomPadding} stroke="#333" strokeWidth="1" />
        
        {peakGyroPerRep.map((value, index) => {
          const barHeight = Math.max(4, ((value - minValue) / range) * plotHeight);
          const x = leftPadding + spacing + index * (barWidth + spacing);
          const y = chartHeight - bottomPadding - barHeight;
          
          const firstValue = peakGyroPerRep[0];
          const decline = firstValue > 0 ? ((firstValue - value) / firstValue) * 100 : 0;
          let color = '#4CAF50';
          if (decline > 20) color = '#ff4444';
          else if (decline > 10) color = '#FFC107';

          return (
            <React.Fragment key={index}>
              <Rect x={x} y={y} width={barWidth} height={barHeight} fill={color} rx={3} />
              <SvgText x={x + barWidth/2} y={chartHeight - 5} fontSize="9" fill="#888" textAnchor="middle">
                {index + 1}
              </SvgText>
            </React.Fragment>
          );
        })}
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
        {/* Source indicator */}
        <View style={styles.sourceIndicator}>
          <Text style={styles.sourceText}>📡 From Device</Text>
        </View>

        {/* Main Stats */}
        <View style={styles.mainStatsCard}>
          <View style={styles.statRow}>
            <View style={styles.mainStat}>
              <Text style={styles.mainStatValue}>{totalReps}</Text>
              <Text style={styles.mainStatLabel}>REPS</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.mainStat}>
              <Text style={styles.mainStatValue}>{formatValue(tutSec, 1, 's')}</Text>
              <Text style={styles.mainStatLabel}>TUT</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.mainStat}>
              <Text style={styles.mainStatValue}>{formatValue(avgTempoSec, 2, 's')}</Text>
              <Text style={styles.mainStatLabel}>AVG TEMPO</Text>
            </View>
          </View>
        </View>

        {/* ====================================== */}
        {/* REP BREAKDOWN SECTION (HIGH PRIORITY) */}
        {/* ====================================== */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Rep Breakdown</Text>
          
          {/* Tempo Stats Summary */}
          <View style={styles.tempoStatsCard}>
            <View style={styles.tempoStatItem}>
              <Text style={styles.tempoStatLabel}>Fastest</Text>
              <Text style={[styles.tempoStatValue, { color: '#4CAF50' }]}>
                {formatValue(fastestTempo, 2, 's')}
              </Text>
            </View>
            <View style={styles.tempoStatDivider} />
            <View style={styles.tempoStatItem}>
              <Text style={styles.tempoStatLabel}>Slowest</Text>
              <Text style={[styles.tempoStatValue, { color: '#FFC107' }]}>
                {formatValue(slowestTempo, 2, 's')}
              </Text>
            </View>
            <View style={styles.tempoStatDivider} />
            <View style={styles.tempoStatItem}>
              <Text style={styles.tempoStatLabel}>Consistency</Text>
              <Text style={styles.tempoStatValue}>
                ±{formatValue(tempoStdDev, 2, 's')}
              </Text>
            </View>
          </View>

          {/* Rep-by-Rep List */}
          {repTimesSec.length > 0 ? (
            <View style={styles.repListCard}>
              {repTimesSec.map((tempo, index) => {
                const isFastest = tempo === fastestTempo;
                const isSlowest = tempo === slowestTempo;
                return (
                  <View key={index} style={styles.repListRow}>
                    <Text style={styles.repListRep}>Rep {index + 1}</Text>
                    <View style={styles.repListRight}>
                      <Text style={[
                        styles.repListTempo,
                        isFastest && styles.fastestTempo,
                        isSlowest && styles.slowestTempo,
                      ]}>
                        {tempo.toFixed(2)}s
                      </Text>
                      {isFastest && <Text style={styles.repBadge}>⚡ Fastest</Text>}
                      {isSlowest && <Text style={styles.repBadgeSlow}>🐢 Slowest</Text>}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : repBreakdown.length > 0 ? (
            <View style={styles.repListCard}>
              {repBreakdown.map((rep, index) => (
                <View key={index} style={styles.repListRow}>
                  <Text style={styles.repListRep}>Rep {rep.rep || index + 1}</Text>
                  <Text style={styles.repListTempo}>
                    {formatValue(rep.tempo_sec, 2, 's')}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.noDataContainer}>
              <Text style={styles.noDataText}>No rep breakdown available</Text>
            </View>
          )}
        </View>

        {/* Output / Fatigue Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚡ Output / Fatigue (Gyro Proxy)</Text>
          
          <View style={[styles.outputLossCard, { borderLeftColor: fatigueInfo.color }]}>
            <View style={styles.outputLossHeader}>
              <Text style={styles.outputLossLabel}>Output Loss</Text>
              <Text style={[styles.outputLossValue, { color: fatigueInfo.color }]}>
                {formatValue(outputLossPct, 1, '%')}
              </Text>
            </View>
            <View style={styles.fatigueBarContainer}>
              <View style={styles.fatigueBarBg}>
                <View style={[
                  styles.fatigueBarFill,
                  { 
                    width: `${Math.min(100, (outputLossPct || 0) * 3.33)}%`,
                    backgroundColor: fatigueInfo.color 
                  }
                ]} />
              </View>
              <View style={styles.fatigueMarkers}>
                <Text style={styles.fatigueMarker}>0%</Text>
                <Text style={styles.fatigueMarker}>10%</Text>
                <Text style={styles.fatigueMarker}>20%</Text>
                <Text style={styles.fatigueMarker}>30%</Text>
              </View>
            </View>
            <Text style={[styles.fatigueLevelText, { color: fatigueInfo.color }]}>
              {fatigueInfo.level}
            </Text>
            <Text style={styles.fatigueMessage}>{fatigueInfo.message}</Text>
          </View>

          {/* Peak Gyro Chart */}
          {peakGyroPerRep.length > 0 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Peak Output Per Rep</Text>
              {renderPeakGyroChart()}
              <Text style={styles.chartNote}>Higher = more explosive</Text>
            </View>
          )}
        </View>

        {/* AI Coaching */}
        <View style={styles.coachingCard}>
          <Text style={styles.coachingTitle}>🤖 AI Coaching</Text>
          
          {outputLossPct != null && outputLossPct > 20 && (
            <View style={styles.coachingPoint}>
              <Text style={styles.coachingBullet}>•</Text>
              <Text style={styles.coachingText}>
                High fatigue detected ({outputLossPct.toFixed(0)}% drop). Stop sets at 20% loss for strength gains.
              </Text>
            </View>
          )}
          
          {outputLossPct != null && outputLossPct < 10 && (
            <View style={styles.coachingPoint}>
              <Text style={styles.coachingBullet}>•</Text>
              <Text style={styles.coachingText}>
                Strong endurance! You could add more reps or weight next set.
              </Text>
            </View>
          )}
          
          {tempoStdDev != null && tempoStdDev < 0.3 && (
            <View style={styles.coachingPoint}>
              <Text style={styles.coachingBullet}>•</Text>
              <Text style={styles.coachingText}>
                Excellent tempo consistency (±{tempoStdDev.toFixed(2)}s). Great control!
              </Text>
            </View>
          )}
          
          {tempoStdDev != null && tempoStdDev > 0.5 && (
            <View style={styles.coachingPoint}>
              <Text style={styles.coachingBullet}>•</Text>
              <Text style={styles.coachingText}>
                Tempo varied (±{tempoStdDev.toFixed(2)}s). Try to maintain consistent speed.
              </Text>
            </View>
          )}
          
          <View style={styles.coachingPoint}>
            <Text style={styles.coachingBullet}>•</Text>
            <Text style={styles.coachingText}>
              {totalReps} reps completed with {formatValue(tutSec, 1)}s time under tension.
            </Text>
          </View>
        </View>

        {/* Session ID */}
        {sessionId && (
          <View style={styles.sessionIdCard}>
            <Text style={styles.sessionIdLabel}>Session ID</Text>
            <Text style={styles.sessionIdValue}>{sessionId}</Text>
          </View>
        )}

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
  sourceIndicator: {
    alignSelf: 'center',
    backgroundColor: '#1a2a1a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 16,
  },
  sourceText: {
    fontSize: 11,
    color: '#4CAF50',
    fontWeight: '600',
  },
  mainStatsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 20,
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  mainStatLabel: {
    fontSize: 10,
    color: '#888',
    letterSpacing: 1,
    marginTop: 4,
  },
  divider: {
    width: 1,
    height: 40,
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
  // Tempo Stats
  tempoStatsCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  tempoStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  tempoStatLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
  },
  tempoStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  tempoStatDivider: {
    width: 1,
    backgroundColor: '#333',
  },
  // Rep List
  repListCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  repListRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  repListRep: {
    fontSize: 14,
    color: '#888',
  },
  repListRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  repListTempo: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  fastestTempo: {
    color: '#4CAF50',
  },
  slowestTempo: {
    color: '#FFC107',
  },
  repBadge: {
    fontSize: 10,
    color: '#4CAF50',
    marginLeft: 8,
  },
  repBadgeSlow: {
    fontSize: 10,
    color: '#FFC107',
    marginLeft: 8,
  },
  // Output Loss
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
    fontSize: 28,
    fontWeight: 'bold',
  },
  fatigueBarContainer: {
    marginBottom: 12,
  },
  fatigueBarBg: {
    height: 10,
    backgroundColor: '#222',
    borderRadius: 5,
    overflow: 'hidden',
  },
  fatigueBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  fatigueMarkers: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  fatigueMarker: {
    fontSize: 9,
    color: '#555',
  },
  fatigueLevelText: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  fatigueMessage: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },
  // Chart
  chartCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  chartTitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 12,
  },
  chartNote: {
    fontSize: 11,
    color: '#555',
    marginTop: 8,
  },
  noDataContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  noDataText: {
    color: '#666',
    fontSize: 13,
  },
  // Coaching
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
    marginBottom: 10,
  },
  coachingBullet: {
    color: '#4CAF50',
    fontSize: 14,
    marginRight: 8,
  },
  coachingText: {
    fontSize: 13,
    color: '#aaa',
    flex: 1,
    lineHeight: 18,
  },
  // Session ID
  sessionIdCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  sessionIdLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  sessionIdValue: {
    fontSize: 12,
    color: '#888',
    fontFamily: 'monospace',
  },
  // Buttons
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