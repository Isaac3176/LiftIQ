import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView, 
  SafeAreaView, 
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Dimensions
} from 'react-native';
import Svg, { Rect, Line, Polyline, Circle, Text as SvgText, G } from 'react-native-svg';
import { useWebSocket } from '../context/WebSocketContext';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function HistoryScreen({ history, onBack, onSelectSession }) {
  const { 
    connectionStatus,
    sessionsList, 
    sessionsLoading,
    selectedSessionSummary,
    selectedSessionLoading,
    selectedSessionRawPoints,
    selectedSessionRawLoading,
    requestSessions, 
    requestSessionDetail,
    requestSessionRaw,
    clearSelectedSession
  } = useWebSocket();

  const [refreshing, setRefreshing] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  const isConnected = connectionStatus === 'connected';

  // =============================================
  // Request sessions on mount
  // =============================================
  useEffect(() => {
    if (isConnected) {
      requestSessions(30);
    }
  }, [isConnected, requestSessions]);

  // =============================================
  // Pull-to-refresh
  // =============================================
  const onRefresh = useCallback(() => {
    if (isConnected) {
      setRefreshing(true);
      requestSessions(30);
    }
  }, [isConnected, requestSessions]);

  useEffect(() => {
    if (sessionsList && refreshing) {
      setRefreshing(false);
    }
  }, [sessionsList, refreshing]);

  // =============================================
  // Handle session detail received
  // =============================================
  useEffect(() => {
    if (selectedSessionSummary && selectedSessionId) {
      // Also request raw data for playback chart
      requestSessionRaw(selectedSessionId, 2000, 5);
    }
  }, [selectedSessionSummary, selectedSessionId, requestSessionRaw]);

  // Use server sessions or fallback to local
  const sessions = sessionsList?.sessions || history || [];

  // =============================================
  // Format helpers
  // =============================================
  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Unknown';
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (seconds) => {
    if (seconds == null) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatValue = (value, decimals = 1, suffix = '') => {
    if (value == null) return '—';
    return `${Number(value).toFixed(decimals)}${suffix}`;
  };

  // =============================================
  // Session tap handler
  // =============================================
  const handleSessionTap = (session) => {
    const sessionId = session.session_id || session.id;
    if (sessionId && isConnected) {
      setSelectedSessionId(sessionId);
      requestSessionDetail(sessionId);
      setShowDetailModal(true);
    }
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedSessionId(null);
    clearSelectedSession();
  };

  // =============================================
  // Compute tempo stats from rep_times_sec
  // =============================================
  const computeTempoStats = (repTimesSec) => {
    if (!repTimesSec || repTimesSec.length === 0) {
      return { fastest: null, slowest: null, stdDev: null };
    }
    
    const fastest = Math.min(...repTimesSec);
    const slowest = Math.max(...repTimesSec);
    
    let stdDev = null;
    if (repTimesSec.length >= 2) {
      const mean = repTimesSec.reduce((a, b) => a + b, 0) / repTimesSec.length;
      const squareDiffs = repTimesSec.map(t => Math.pow(t - mean, 2));
      const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / repTimesSec.length;
      stdDev = Math.sqrt(avgSquareDiff);
    }
    
    return { fastest, slowest, stdDev };
  };

  // =============================================
  // Render Playback Chart (gyro_filt vs t)
  // =============================================
  const renderPlaybackChart = () => {
    const points = selectedSessionRawPoints?.points || [];
    
    if (selectedSessionRawLoading) {
      return (
        <View style={styles.chartLoading}>
          <ActivityIndicator size="small" color="#4CAF50" />
          <Text style={styles.chartLoadingText}>Loading playback data...</Text>
        </View>
      );
    }
    
    if (!points || points.length === 0) {
      return (
        <View style={styles.noChartData}>
          <Text style={styles.noChartDataText}>No playback data available</Text>
        </View>
      );
    }

    const chartWidth = SCREEN_WIDTH - 80;
    const chartHeight = 150;
    const leftPadding = 45;
    const rightPadding = 10;
    const topPadding = 10;
    const bottomPadding = 25;
    const plotWidth = chartWidth - leftPadding - rightPadding;
    const plotHeight = chartHeight - topPadding - bottomPadding;

    // Get data bounds
    const gyroValues = points.map(p => p.gyro_filt).filter(v => v != null);
    const timeValues = points.map(p => p.t).filter(v => v != null);
    
    if (gyroValues.length === 0 || timeValues.length === 0) {
      return (
        <View style={styles.noChartData}>
          <Text style={styles.noChartDataText}>Invalid playback data</Text>
        </View>
      );
    }

    const minGyro = Math.min(...gyroValues);
    const maxGyro = Math.max(...gyroValues);
    const gyroRange = (maxGyro - minGyro) || 1;
    
    const minTime = Math.min(...timeValues);
    const maxTime = Math.max(...timeValues);
    const timeRange = (maxTime - minTime) || 1;

    // Build polyline points
    const polylinePoints = points
      .filter(p => p.gyro_filt != null && p.t != null)
      .map(p => {
        const x = leftPadding + ((p.t - minTime) / timeRange) * plotWidth;
        const y = topPadding + plotHeight - ((p.gyro_filt - minGyro) / gyroRange) * plotHeight;
        return `${x},${y}`;
      })
      .join(' ');

    // Find state change points for coloring
    const stateSegments = [];
    let currentState = points[0]?.state;
    let segmentStart = 0;
    
    for (let i = 1; i < points.length; i++) {
      if (points[i].state !== currentState) {
        stateSegments.push({
          state: currentState,
          startIdx: segmentStart,
          endIdx: i - 1
        });
        currentState = points[i].state;
        segmentStart = i;
      }
    }
    stateSegments.push({
      state: currentState,
      startIdx: segmentStart,
      endIdx: points.length - 1
    });

    return (
      <Svg width={chartWidth} height={chartHeight}>
        {/* Background grid */}
        <Line x1={leftPadding} y1={topPadding} x2={leftPadding} y2={chartHeight - bottomPadding} stroke="#333" strokeWidth="1" />
        <Line x1={leftPadding} y1={chartHeight - bottomPadding} x2={chartWidth - rightPadding} y2={chartHeight - bottomPadding} stroke="#333" strokeWidth="1" />
        
        {/* Y-axis labels */}
        <SvgText x={leftPadding - 5} y={topPadding + 4} fontSize="9" fill="#666" textAnchor="end">
          {maxGyro.toFixed(0)}
        </SvgText>
        <SvgText x={leftPadding - 5} y={chartHeight - bottomPadding} fontSize="9" fill="#666" textAnchor="end">
          {minGyro.toFixed(0)}
        </SvgText>
        
        {/* X-axis labels */}
        <SvgText x={leftPadding} y={chartHeight - 8} fontSize="9" fill="#666" textAnchor="start">
          {minTime.toFixed(1)}s
        </SvgText>
        <SvgText x={chartWidth - rightPadding} y={chartHeight - 8} fontSize="9" fill="#666" textAnchor="end">
          {maxTime.toFixed(1)}s
        </SvgText>

        {/* State background regions */}
        {stateSegments.map((seg, idx) => {
          if (seg.startIdx >= points.length || seg.endIdx >= points.length) return null;
          const startPoint = points[seg.startIdx];
          const endPoint = points[seg.endIdx];
          if (!startPoint || !endPoint) return null;
          
          const x1 = leftPadding + ((startPoint.t - minTime) / timeRange) * plotWidth;
          const x2 = leftPadding + ((endPoint.t - minTime) / timeRange) * plotWidth;
          const fillColor = seg.state === 'MOVING' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 255, 255, 0.02)';
          
          return (
            <Rect
              key={idx}
              x={x1}
              y={topPadding}
              width={Math.max(1, x2 - x1)}
              height={plotHeight}
              fill={fillColor}
            />
          );
        })}

        {/* Main line */}
        <Polyline
          points={polylinePoints}
          fill="none"
          stroke="#4CAF50"
          strokeWidth="1.5"
        />
      </Svg>
    );
  };

  // =============================================
  // Render Session Detail Modal
  // =============================================
  const renderDetailModal = () => {
    const summary = selectedSessionSummary?.summary || {};
    const repTimesSec = summary.rep_times_sec || [];
    const repBreakdown = summary.rep_breakdown || [];
    const tempoStats = computeTempoStats(repTimesSec);

    return (
      <Modal
        visible={showDetailModal}
        animationType="slide"
        transparent={false}
        onRequestClose={closeDetailModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeDetailModal}>
              <Text style={styles.modalBackButton}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Session Details</Text>
            <View style={{ width: 60 }} />
          </View>

          {selectedSessionLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4CAF50" />
              <Text style={styles.loadingText}>Loading session...</Text>
            </View>
          ) : selectedSessionSummary?.error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Failed to load session</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.modalContent}>
              {/* Source indicator */}
              <View style={styles.sourceIndicator}>
                <Text style={styles.sourceText}>📡 From Device</Text>
              </View>

              {/* Main Stats */}
              <View style={styles.detailStatsCard}>
                <View style={styles.detailStatRow}>
                  <View style={styles.detailStat}>
                    <Text style={styles.detailStatValue}>{summary.total_reps || 0}</Text>
                    <Text style={styles.detailStatLabel}>REPS</Text>
                  </View>
                  <View style={styles.detailDivider} />
                  <View style={styles.detailStat}>
                    <Text style={styles.detailStatValue}>{formatDuration(summary.duration_sec)}</Text>
                    <Text style={styles.detailStatLabel}>DURATION</Text>
                  </View>
                  <View style={styles.detailDivider} />
                  <View style={styles.detailStat}>
                    <Text style={styles.detailStatValue}>{formatValue(summary.tut_sec, 1, 's')}</Text>
                    <Text style={styles.detailStatLabel}>TUT</Text>
                  </View>
                </View>
              </View>

              {/* Metrics Grid */}
              <View style={styles.metricsGrid}>
                <View style={styles.metricBox}>
                  <Text style={styles.metricBoxLabel}>Avg Tempo</Text>
                  <Text style={styles.metricBoxValue}>{formatValue(summary.avg_tempo_sec, 2, 's')}</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricBoxLabel}>Output Loss</Text>
                  <Text style={[
                    styles.metricBoxValue,
                    summary.output_loss_pct > 20 ? styles.dangerText :
                    summary.output_loss_pct > 10 ? styles.warningText : styles.successText
                  ]}>
                    {formatValue(summary.output_loss_pct, 1, '%')}
                  </Text>
                </View>
              </View>

              {/* Playback Chart */}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>📈 Session Playback</Text>
                <View style={styles.playbackChartCard}>
                  {renderPlaybackChart()}
                  <View style={styles.chartLegend}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: 'rgba(76, 175, 80, 0.3)' }]} />
                      <Text style={styles.legendText}>Moving</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: 'rgba(255, 255, 255, 0.1)' }]} />
                      <Text style={styles.legendText}>Waiting</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Tempo Stats */}
              {repTimesSec.length > 0 && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>⏱️ Tempo Analysis</Text>
                  <View style={styles.tempoStatsCard}>
                    <View style={styles.tempoStatItem}>
                      <Text style={styles.tempoStatLabel}>Fastest</Text>
                      <Text style={[styles.tempoStatValue, { color: '#4CAF50' }]}>
                        {formatValue(tempoStats.fastest, 2, 's')}
                      </Text>
                    </View>
                    <View style={styles.tempoStatDivider} />
                    <View style={styles.tempoStatItem}>
                      <Text style={styles.tempoStatLabel}>Slowest</Text>
                      <Text style={[styles.tempoStatValue, { color: '#FFC107' }]}>
                        {formatValue(tempoStats.slowest, 2, 's')}
                      </Text>
                    </View>
                    <View style={styles.tempoStatDivider} />
                    <View style={styles.tempoStatItem}>
                      <Text style={styles.tempoStatLabel}>Consistency</Text>
                      <Text style={styles.tempoStatValue}>
                        ±{formatValue(tempoStats.stdDev, 2, 's')}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Rep Breakdown */}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>📊 Rep Breakdown</Text>
                {repTimesSec.length > 0 ? (
                  <View style={styles.repBreakdownContainer}>
                    {repTimesSec.map((tempo, index) => {
                      const isFastest = tempo === tempoStats.fastest;
                      const isSlowest = tempo === tempoStats.slowest;
                      return (
                        <View key={index} style={styles.repBreakdownRow}>
                          <Text style={styles.repBreakdownRep}>Rep {index + 1}</Text>
                          <View style={styles.repBreakdownRight}>
                            <Text style={[
                              styles.repBreakdownValue,
                              isFastest && styles.fastestText,
                              isSlowest && styles.slowestText,
                            ]}>
                              {tempo.toFixed(2)}s
                            </Text>
                            {isFastest && <Text style={styles.repBadge}>⚡</Text>}
                            {isSlowest && <Text style={styles.repBadgeSlow}>🐢</Text>}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : repBreakdown.length > 0 ? (
                  <View style={styles.repBreakdownContainer}>
                    {repBreakdown.map((rep, index) => (
                      <View key={index} style={styles.repBreakdownRow}>
                        <Text style={styles.repBreakdownRep}>Rep {rep.rep || index + 1}</Text>
                        <Text style={styles.repBreakdownValue}>
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

              {/* Session Info */}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>ℹ️ Session Info</Text>
                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Session ID</Text>
                    <Text style={styles.infoValue} numberOfLines={1}>
                      {selectedSessionId || '—'}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Start Time</Text>
                    <Text style={styles.infoValue}>
                      {summary.start_time ? new Date(summary.start_time).toLocaleString() : '—'}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>End Time</Text>
                    <Text style={styles.infoValue}>
                      {summary.end_time ? new Date(summary.end_time).toLocaleString() : '—'}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Raw Points</Text>
                    <Text style={styles.infoValue}>
                      {selectedSessionRawPoints?.count || '—'}
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    );
  };

  // =============================================
  // Main Render
  // =============================================
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Workout History</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || sessionsLoading}
            onRefresh={onRefresh}
            tintColor="#4CAF50"
            colors={['#4CAF50']}
          />
        }
      >
        {/* Offline Banner */}
        {!isConnected && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerText}>📡 Offline - Connect to load sessions</Text>
          </View>
        )}

        {/* Summary Stats */}
        {sessions.length > 0 && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{sessionsList?.count || sessions.length}</Text>
              <Text style={styles.summaryLabel}>Sessions</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {Math.round(sessions.reduce((sum, s) => sum + (s.total_reps || 0), 0) / sessions.length) || 0}
              </Text>
              <Text style={styles.summaryLabel}>Avg Reps</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {formatValue(
                  sessions.filter(s => s.avg_tempo_sec).reduce((sum, s) => sum + s.avg_tempo_sec, 0) / 
                  sessions.filter(s => s.avg_tempo_sec).length || 0,
                  2
                )}s
              </Text>
              <Text style={styles.summaryLabel}>Avg Tempo</Text>
            </View>
          </View>
        )}

        {/* Loading */}
        {sessionsLoading && sessions.length === 0 && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Loading sessions...</Text>
          </View>
        )}

        {/* Sessions List */}
        {sessions.length > 0 && (
          <>
            <Text style={styles.listTitle}>Recent Workouts</Text>
            
            {sessions.map((session, index) => {
              const sessionId = session.session_id || session.id || index;
              const timestamp = session.end_time || session.start_time || session.timestamp;
              
              return (
                <TouchableOpacity
                  key={sessionId}
                  style={styles.sessionCard}
                  onPress={() => handleSessionTap(session)}
                >
                  <View style={styles.sessionHeader}>
                    <View>
                      <Text style={styles.sessionDate}>
                        {formatDate(timestamp)} {formatTime(timestamp) && `• ${formatTime(timestamp)}`}
                      </Text>
                      <Text style={styles.sessionDuration}>
                        Duration: {formatDuration(session.duration_sec)}
                      </Text>
                    </View>
                    {session.output_loss_pct != null && (
                      <View style={[
                        styles.outputBadge,
                        session.output_loss_pct > 20 ? styles.badgeDanger :
                        session.output_loss_pct > 10 ? styles.badgeWarning : styles.badgeSuccess
                      ]}>
                        <Text style={styles.outputBadgeText}>
                          {session.output_loss_pct.toFixed(0)}%
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.sessionStats}>
                    <View style={styles.sessionStat}>
                      <Text style={styles.statValue}>{session.total_reps || 0}</Text>
                      <Text style={styles.statLabel}>REPS</Text>
                    </View>
                    <View style={styles.sessionStatDivider} />
                    <View style={styles.sessionStat}>
                      <Text style={styles.statValue}>{formatValue(session.tut_sec, 1)}s</Text>
                      <Text style={styles.statLabel}>TUT</Text>
                    </View>
                    <View style={styles.sessionStatDivider} />
                    <View style={styles.sessionStat}>
                      <Text style={styles.statValue}>{formatValue(session.avg_tempo_sec, 2)}s</Text>
                      <Text style={styles.statLabel}>TEMPO</Text>
                    </View>
                  </View>

                  <View style={styles.sessionFooter}>
                    <Text style={styles.viewDetails}>View Details →</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Empty State */}
        {!sessionsLoading && sessions.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🏋️</Text>
            <Text style={styles.emptyText}>No sessions yet</Text>
            <Text style={styles.emptySubtext}>
              {isConnected ? 'Complete a workout to see history' : 'Connect to server to load sessions'}
            </Text>
            {isConnected && (
              <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
                <Text style={styles.refreshButtonText}>Refresh</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {/* Detail Modal */}
      {renderDetailModal()}
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
  offlineBanner: {
    backgroundColor: '#3a2a1a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  offlineBannerText: {
    color: '#FFC107',
    fontSize: 13,
  },
  summaryCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    marginBottom: 24,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  summaryLabel: {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#333',
  },
  loadingContainer: {
    padding: 60,
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 16,
    fontSize: 14,
  },
  errorContainer: {
    padding: 60,
    alignItems: 'center',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  sessionCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sessionDate: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  sessionDuration: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  outputBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeSuccess: {
    backgroundColor: '#1a3a1a',
  },
  badgeWarning: {
    backgroundColor: '#3a3a1a',
  },
  badgeDanger: {
    backgroundColor: '#3a1a1a',
  },
  outputBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#fff',
  },
  sessionStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#222',
  },
  sessionStat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 9,
    color: '#888',
    marginTop: 4,
    letterSpacing: 1,
  },
  sessionStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#333',
  },
  sessionFooter: {
    marginTop: 12,
    alignItems: 'flex-end',
  },
  viewDetails: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  refreshButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  modalBackButton: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalContent: {
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
  detailStatsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  detailStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailStat: {
    flex: 1,
    alignItems: 'center',
  },
  detailStatValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  detailStatLabel: {
    fontSize: 10,
    color: '#888',
    letterSpacing: 1,
    marginTop: 4,
  },
  detailDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#333',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  metricBox: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  metricBoxLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
  },
  metricBoxValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  successText: {
    color: '#4CAF50',
  },
  warningText: {
    color: '#FFC107',
  },
  dangerText: {
    color: '#ff4444',
  },
  detailSection: {
    marginBottom: 20,
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  playbackChartCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  chartLoading: {
    padding: 40,
    alignItems: 'center',
  },
  chartLoadingText: {
    color: '#888',
    fontSize: 12,
    marginTop: 8,
  },
  noChartData: {
    padding: 30,
    alignItems: 'center',
  },
  noChartDataText: {
    color: '#666',
    fontSize: 13,
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    gap: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 2,
    marginRight: 6,
  },
  legendText: {
    fontSize: 11,
    color: '#888',
  },
  tempoStatsCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
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
  repBreakdownContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  repBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  repBreakdownRep: {
    fontSize: 14,
    color: '#888',
  },
  repBreakdownRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  repBreakdownValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  fastestText: {
    color: '#4CAF50',
  },
  slowestText: {
    color: '#FFC107',
  },
  repBadge: {
    fontSize: 12,
    marginLeft: 8,
  },
  repBadgeSlow: {
    fontSize: 12,
    marginLeft: 8,
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
  infoCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  infoLabel: {
    fontSize: 13,
    color: '#888',
  },
  infoValue: {
    fontSize: 13,
    color: '#fff',
    maxWidth: '55%',
    textAlign: 'right',
  },
});