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
import Svg, { Rect, Line, Polyline, Text as SvgText } from 'react-native-svg';
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

  useEffect(() => {
    if (isConnected) {
      requestSessions(30);
    }
  }, [isConnected, requestSessions]);

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

  useEffect(() => {
    if (selectedSessionSummary && selectedSessionId) {
      requestSessionRaw(selectedSessionId, 2000, 5);
    }
  }, [selectedSessionSummary, selectedSessionId, requestSessionRaw]);

  const sessions = sessionsList?.sessions || history || [];

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

  const renderPlaybackChart = () => {
    const points = selectedSessionRawPoints?.points || [];
    
    if (selectedSessionRawLoading) {
      return (
        <View style={styles.chartLoading}>
          <ActivityIndicator size="small" color="#4CAF50" />
          <Text style={styles.chartLoadingText}>Loading data...</Text>
        </View>
      );
    }
    
    if (!points || points.length === 0) {
      return (
        <View style={styles.noChartData}>
          <Text style={styles.noChartDataText}>No playback data</Text>
        </View>
      );
    }

    const chartWidth = SCREEN_WIDTH - 80;
    const chartHeight = 120;
    const leftPadding = 40;
    const rightPadding = 10;
    const topPadding = 10;
    const bottomPadding = 25;
    const plotWidth = chartWidth - leftPadding - rightPadding;
    const plotHeight = chartHeight - topPadding - bottomPadding;

    const gyroValues = points.map(p => p.gyro_filt).filter(v => v != null);
    const timeValues = points.map(p => p.t).filter(v => v != null);
    
    if (gyroValues.length === 0 || timeValues.length === 0) {
      return (
        <View style={styles.noChartData}>
          <Text style={styles.noChartDataText}>Invalid data</Text>
        </View>
      );
    }

    const minGyro = Math.min(...gyroValues);
    const maxGyro = Math.max(...gyroValues);
    const gyroRange = (maxGyro - minGyro) || 1;
    
    const minTime = Math.min(...timeValues);
    const maxTime = Math.max(...timeValues);
    const timeRange = (maxTime - minTime) || 1;

    const polylinePoints = points
      .filter(p => p.gyro_filt != null && p.t != null)
      .map(p => {
        const x = leftPadding + ((p.t - minTime) / timeRange) * plotWidth;
        const y = topPadding + plotHeight - ((p.gyro_filt - minGyro) / gyroRange) * plotHeight;
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <Svg width={chartWidth} height={chartHeight}>
        <Line x1={leftPadding} y1={topPadding} x2={leftPadding} y2={chartHeight - bottomPadding} stroke="#222" strokeWidth="1" />
        <Line x1={leftPadding} y1={chartHeight - bottomPadding} x2={chartWidth - rightPadding} y2={chartHeight - bottomPadding} stroke="#222" strokeWidth="1" />
        
        <SvgText x={leftPadding - 5} y={topPadding + 4} fontSize="9" fill="#555" textAnchor="end">
          {maxGyro.toFixed(0)}
        </SvgText>
        <SvgText x={leftPadding - 5} y={chartHeight - bottomPadding} fontSize="9" fill="#555" textAnchor="end">
          {minGyro.toFixed(0)}
        </SvgText>
        
        <SvgText x={leftPadding} y={chartHeight - 8} fontSize="9" fill="#555" textAnchor="start">
          {minTime.toFixed(1)}s
        </SvgText>
        <SvgText x={chartWidth - rightPadding} y={chartHeight - 8} fontSize="9" fill="#555" textAnchor="end">
          {maxTime.toFixed(1)}s
        </SvgText>

        <Polyline
          points={polylinePoints}
          fill="none"
          stroke="#4CAF50"
          strokeWidth="1.5"
        />
      </Svg>
    );
  };

  const renderDetailModal = () => {
    const summary = selectedSessionSummary?.summary || {};
    const repTimesSec = summary.rep_times_sec || [];
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
              <Text style={styles.modalBackButton}>‹ Back</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Session Details</Text>
            <View style={{ width: 60 }} />
          </View>

          {selectedSessionLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4CAF50" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : selectedSessionSummary?.error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Failed to load session</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.modalContent}>
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

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Session Playback</Text>
                <View style={styles.playbackChartCard}>
                  {renderPlaybackChart()}
                </View>
              </View>

              {repTimesSec.length > 0 && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Tempo Analysis</Text>
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
                      <Text style={styles.tempoStatLabel}>Std Dev</Text>
                      <Text style={styles.tempoStatValue}>
                        {formatValue(tempoStats.stdDev, 2, 's')}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {repTimesSec.length > 0 && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Rep Breakdown</Text>
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
                            {isFastest && <View style={[styles.repIndicator, { backgroundColor: '#4CAF50' }]} />}
                            {isSlowest && <View style={[styles.repIndicator, { backgroundColor: '#FFC107' }]} />}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Session Info</Text>
                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Session ID</Text>
                    <Text style={styles.infoValue} numberOfLines={1}>
                      {selectedSessionId || '—'}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Start</Text>
                    <Text style={styles.infoValue}>
                      {summary.start_time ? new Date(summary.start_time).toLocaleString() : '—'}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>End</Text>
                    <Text style={styles.infoValue}>
                      {summary.end_time ? new Date(summary.end_time).toLocaleString() : '—'}
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>History</Text>
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
        {!isConnected && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerText}>Offline - Connect to load sessions</Text>
          </View>
        )}

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
          </View>
        )}

        {sessionsLoading && sessions.length === 0 && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        )}

        {sessions.length > 0 && (
          <>
            <Text style={styles.listTitle}>Recent Sessions</Text>
            
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
                        {formatDate(timestamp)} {formatTime(timestamp) && `· ${formatTime(timestamp)}`}
                      </Text>
                      <Text style={styles.sessionDuration}>
                        {formatDuration(session.duration_sec)}
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
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {!sessionsLoading && sessions.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No sessions yet</Text>
            <Text style={styles.emptySubtext}>
              {isConnected ? 'Complete a workout to see history' : 'Connect to load sessions'}
            </Text>
            {isConnected && (
              <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
                <Text style={styles.refreshButtonText}>Refresh</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

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
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  scrollContent: {
    padding: 20,
  },
  offlineBanner: {
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.3)',
  },
  offlineBannerText: {
    color: '#FFC107',
    fontSize: 13,
  },
  summaryCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  summaryLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#222',
  },
  loadingContainer: {
    padding: 60,
    alignItems: 'center',
  },
  loadingText: {
    color: '#666',
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
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sessionCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
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
    color: '#555',
    marginTop: 2,
  },
  outputBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeSuccess: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
  },
  badgeWarning: {
    backgroundColor: 'rgba(255, 193, 7, 0.15)',
  },
  badgeDanger: {
    backgroundColor: 'rgba(255, 68, 68, 0.15)',
  },
  outputBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  sessionStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: '#1a1a1a',
  },
  sessionStat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  statLabel: {
    fontSize: 9,
    color: '#555',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  sessionStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#1a1a1a',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#555',
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
    fontWeight: '600',
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
    borderBottomColor: '#1a1a1a',
  },
  modalBackButton: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '500',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  modalContent: {
    padding: 20,
  },
  detailStatsCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1a1a1a',
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
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  detailStatLabel: {
    fontSize: 9,
    color: '#666',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  detailDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#222',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  metricBox: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  metricBoxLabel: {
    fontSize: 10,
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  metricBoxValue: {
    fontSize: 16,
    fontWeight: '600',
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
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  playbackChartCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  chartLoading: {
    padding: 40,
    alignItems: 'center',
  },
  chartLoadingText: {
    color: '#666',
    fontSize: 12,
    marginTop: 8,
  },
  noChartData: {
    padding: 30,
    alignItems: 'center',
  },
  noChartDataText: {
    color: '#555',
    fontSize: 13,
  },
  tempoStatsCard: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  tempoStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  tempoStatLabel: {
    fontSize: 10,
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  tempoStatValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  tempoStatDivider: {
    width: 1,
    backgroundColor: '#222',
  },
  repBreakdownContainer: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  repBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
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
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  fastestText: {
    color: '#4CAF50',
  },
  slowestText: {
    color: '#FFC107',
  },
  repIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 8,
  },
  infoCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  infoLabel: {
    fontSize: 13,
    color: '#666',
  },
  infoValue: {
    fontSize: 13,
    color: '#888',
    maxWidth: '55%',
    textAlign: 'right',
  },
});