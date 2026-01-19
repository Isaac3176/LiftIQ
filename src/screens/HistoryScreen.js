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
  Modal
} from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { useWebSocket } from '../context/WebSocketContext';

export default function HistoryScreen({ history, onBack, onSelectSession }) {
  const { 
    connectionStatus,
    sessionsList, 
    sessionsLoading, 
    sessionDetail,
    sessionDetailLoading,
    requestSessions, 
    requestSessionDetail,
    clearSessionDetail
  } = useWebSocket();

  const [refreshing, setRefreshing] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  const isConnected = connectionStatus === 'connected';

  // Request sessions when screen opens
  useEffect(() => {
    if (isConnected) {
      requestSessions(20);
    }
  }, [isConnected, requestSessions]);

  // Handle pull-to-refresh
  const onRefresh = useCallback(() => {
    if (isConnected) {
      setRefreshing(true);
      requestSessions(20);
    }
  }, [isConnected, requestSessions]);

  // Stop refreshing when data arrives
  useEffect(() => {
    if (sessionsList && refreshing) {
      setRefreshing(false);
    }
  }, [sessionsList, refreshing]);

  // Handle session detail received
  useEffect(() => {
    if (sessionDetail && selectedSessionId) {
      setShowDetailModal(true);
    }
  }, [sessionDetail, selectedSessionId]);

  // Use server sessions if available, fallback to local history
  const sessions = sessionsList?.sessions || history || [];

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Unknown';
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (seconds) => {
    if (seconds == null) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatValue = (value, decimals = 1, suffix = '') => {
    if (value == null || value === undefined) return 'N/A';
    return `${Number(value).toFixed(decimals)}${suffix}`;
  };

  // Handle session tap - request detail from server
  const handleSessionTap = (session) => {
    const sessionId = session.session_id || session.id;
    
    if (sessionId && isConnected) {
      setSelectedSessionId(sessionId);
      requestSessionDetail(sessionId);
    } else if (onSelectSession) {
      // Fallback to local session data
      onSelectSession(session);
    }
  };

  // Close detail modal
  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedSessionId(null);
    clearSessionDetail();
  };

  // Render peak gyro chart in detail modal
  const renderPeakGyroChart = (peakGyroPerRep) => {
    if (!peakGyroPerRep || peakGyroPerRep.length === 0) {
      return (
        <View style={styles.noChartData}>
          <Text style={styles.noChartDataText}>No peak output data</Text>
        </View>
      );
    }

    const maxValue = Math.max(...peakGyroPerRep);
    const minValue = Math.min(...peakGyroPerRep);
    const range = (maxValue - minValue) || 1;
    
    const chartWidth = 280;
    const chartHeight = 100;
    const barWidth = Math.max(12, Math.min(30, chartWidth / peakGyroPerRep.length - 4));
    const spacing = (chartWidth - barWidth * peakGyroPerRep.length) / (peakGyroPerRep.length + 1);

    return (
      <Svg width={chartWidth} height={chartHeight}>
        <Line x1={0} y1={chartHeight - 20} x2={chartWidth} y2={chartHeight - 20} stroke="#333" strokeWidth="1" />
        {peakGyroPerRep.map((value, index) => {
          const barHeight = Math.max(4, ((value - minValue) / range) * (chartHeight - 30));
          const x = spacing + index * (barWidth + spacing);
          const y = chartHeight - 20 - barHeight;
          
          const firstValue = peakGyroPerRep[0];
          const decline = firstValue > 0 ? ((firstValue - value) / firstValue) * 100 : 0;
          let color = '#4CAF50';
          if (decline > 20) color = '#ff4444';
          else if (decline > 10) color = '#FFC107';

          return (
            <React.Fragment key={index}>
              <Rect x={x} y={y} width={barWidth} height={barHeight} fill={color} rx={2} />
              <SvgText x={x + barWidth/2} y={chartHeight - 5} fontSize="9" fill="#888" textAnchor="middle">
                {index + 1}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    );
  };

  // Render session detail modal
  const renderDetailModal = () => {
    const summary = sessionDetail?.summary || {};
    const peakGyroPerRep = summary.peak_gyro_per_rep || [];
    const repBreakdown = summary.rep_breakdown || [];

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

          {sessionDetailLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4CAF50" />
              <Text style={styles.loadingText}>Loading session...</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.modalContent}>
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
                </View>
              </View>

              {/* Metrics Grid */}
              <View style={styles.metricsGrid}>
                <View style={styles.metricBox}>
                  <Text style={styles.metricBoxLabel}>TUT</Text>
                  <Text style={styles.metricBoxValue}>{formatValue(summary.tut_sec, 1, 's')}</Text>
                </View>
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

              {/* Peak Gyro Chart */}
              {peakGyroPerRep.length > 0 && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>⚡ Peak Output Per Rep (Proxy)</Text>
                  <View style={styles.chartContainer}>
                    {renderPeakGyroChart(peakGyroPerRep)}
                  </View>
                </View>
              )}

              {/* Rep Breakdown */}
              {repBreakdown.length > 0 && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>📊 Rep Breakdown</Text>
                  <View style={styles.repBreakdownContainer}>
                    {repBreakdown.map((rep, index) => (
                      <View key={index} style={styles.repBreakdownRow}>
                        <Text style={styles.repBreakdownRep}>Rep {index + 1}</Text>
                        <Text style={styles.repBreakdownValue}>
                          {typeof rep === 'object' ? formatValue(rep.tempo || rep.time, 2, 's') : formatValue(rep, 2, 's')}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Session Info */}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>ℹ️ Session Info</Text>
                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Session ID</Text>
                    <Text style={styles.infoValue}>{summary.session_id || 'N/A'}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Start Time</Text>
                    <Text style={styles.infoValue}>
                      {summary.start_time ? new Date(summary.start_time).toLocaleString() : 'N/A'}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>End Time</Text>
                    <Text style={styles.infoValue}>
                      {summary.end_time ? new Date(summary.end_time).toLocaleString() : 'N/A'}
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
        {/* Connection Status */}
        {!isConnected && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerText}>📡 Offline - Showing local data</Text>
          </View>
        )}

        {/* Summary Stats */}
        {sessions.length > 0 && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{sessionsList?.count || sessions.length}</Text>
              <Text style={styles.summaryLabel}>Total Sessions</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {sessions.length > 0 
                  ? Math.round(sessions.reduce((sum, s) => sum + (s.total_reps || s.reps || 0), 0) / sessions.length)
                  : 0}
              </Text>
              <Text style={styles.summaryLabel}>Avg Reps</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {sessions.length > 0 
                  ? formatValue(
                      sessions.reduce((sum, s) => sum + (s.avg_tempo_sec || s.avgVelocity || 0), 0) / sessions.length,
                      2
                    )
                  : 'N/A'}
              </Text>
              <Text style={styles.summaryLabel}>Avg Tempo</Text>
            </View>
          </View>
        )}

        {/* Loading State */}
        {sessionsLoading && sessions.length === 0 && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Loading sessions...</Text>
          </View>
        )}

        {/* History List */}
        {sessions.length > 0 && (
          <>
            <Text style={styles.listTitle}>Recent Workouts</Text>
            
            {sessions.map((session, index) => {
              const sessionId = session.session_id || session.id || index;
              const timestamp = session.end_time || session.start_time || session.timestamp;
              const reps = session.total_reps || session.reps || 0;
              const tutSec = session.tut_sec;
              const avgTempo = session.avg_tempo_sec || session.avgVelocity;
              const outputLoss = session.output_loss_pct;

              return (
                <TouchableOpacity
                  key={sessionId}
                  style={styles.sessionCard}
                  onPress={() => handleSessionTap(session)}
                >
                  <View style={styles.sessionHeader}>
                    <View>
                      <Text style={styles.sessionExercise}>
                        {session.exercise || 'Workout Session'}
                      </Text>
                      <Text style={styles.sessionDate}>
                        {formatDate(timestamp)} {formatTime(timestamp) && `• ${formatTime(timestamp)}`}
                      </Text>
                    </View>
                    {outputLoss != null && (
                      <View style={[
                        styles.outputLossBadge,
                        outputLoss > 20 ? styles.badgeDanger :
                        outputLoss > 10 ? styles.badgeWarning : styles.badgeSuccess
                      ]}>
                        <Text style={styles.outputLossBadgeText}>
                          {outputLoss.toFixed(0)}% loss
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.sessionStats}>
                    <View style={styles.sessionStat}>
                      <Text style={styles.statValue}>{reps}</Text>
                      <Text style={styles.statLabel}>REPS</Text>
                    </View>
                    <View style={styles.sessionDivider} />
                    <View style={styles.sessionStat}>
                      <Text style={styles.statValue}>{formatValue(tutSec, 1, 's')}</Text>
                      <Text style={styles.statLabel}>TUT</Text>
                    </View>
                    <View style={styles.sessionDivider} />
                    <View style={styles.sessionStat}>
                      <Text style={styles.statValue}>{formatValue(avgTempo, 2, 's')}</Text>
                      <Text style={styles.statLabel}>TEMPO</Text>
                    </View>
                  </View>

                  <View style={styles.sessionFooter}>
                    <Text style={styles.sessionDuration}>
                      {session.duration_sec ? formatDuration(session.duration_sec) : ''}
                    </Text>
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
              {isConnected 
                ? 'Start your first workout to see history'
                : 'Connect to server to load sessions'}
            </Text>
            {isConnected && (
              <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
                <Text style={styles.refreshButtonText}>Refresh</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {/* Session Detail Modal */}
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
    fontSize: 24,
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
    marginBottom: 16,
  },
  sessionExercise: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  sessionDate: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  outputLossBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
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
  outputLossBadgeText: {
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
  sessionDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#333',
  },
  sessionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  sessionDuration: {
    fontSize: 12,
    color: '#666',
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
  detailStatsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
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
    fontSize: 36,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  detailStatLabel: {
    fontSize: 11,
    color: '#888',
    letterSpacing: 1,
    marginTop: 4,
  },
  detailDivider: {
    width: 1,
    height: 50,
    backgroundColor: '#333',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
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
  chartContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  noChartData: {
    padding: 24,
    alignItems: 'center',
  },
  noChartDataText: {
    color: '#666',
    fontSize: 13,
  },
  repBreakdownContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  repBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  repBreakdownRep: {
    fontSize: 14,
    color: '#888',
  },
  repBreakdownValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  infoCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
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
    maxWidth: '60%',
    textAlign: 'right',
  },
});