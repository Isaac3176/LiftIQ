import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, StatusBar, ActivityIndicator, Alert } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useWebSocket } from '../context/WebSocketContext';

export default function SessionSummaryScreen({ sessionData, onViewHistory, onBackToDashboard }) {
  const { 
    piIpAddress,
    exportResult, 
    exportLoading, 
    requestExportSession, 
    clearExportResult,
    buildExportUrl,
    repEvents
  } = useWebSocket();

  const [downloadProgress, setDownloadProgress] = useState(null);
  const [shareError, setShareError] = useState(null);

  // Get session data from server summary
  const serverSummary = sessionData?.serverSummary;
  const sessionRepEvents = sessionData?.repEvents || repEvents || [];
  
  // Session ID - check multiple sources
  const sessionId = serverSummary?.sessionId || sessionData?.sessionId || null;
  const totalReps = serverSummary?.totalReps ?? sessionData?.reps ?? 0;
  const tutSec = serverSummary?.tutSec ?? null;
  const avgTempoSec = serverSummary?.avgTempoSec ?? null;
  const repTimesSec = serverSummary?.repTimesSec || [];
  const outputLossPct = serverSummary?.outputLossPct ?? null;
  const peakGyroPerRep = serverSummary?.peakGyroPerRep || [];
  
  // Velocity proxy fields
  const avgPeakSpeedProxy = serverSummary?.avgPeakSpeedProxy ?? null;
  const speedLossPct = serverSummary?.speedLossPct ?? null;

  // Calculate tempo stats
  const fastestTempo = repTimesSec.length > 0 ? Math.min(...repTimesSec) : null;
  const slowestTempo = repTimesSec.length > 0 ? Math.max(...repTimesSec) : null;
  
  const tempoStdDev = (() => {
    if (repTimesSec.length < 2) return null;
    const mean = repTimesSec.reduce((a, b) => a + b, 0) / repTimesSec.length;
    const squareDiffs = repTimesSec.map(t => Math.pow(t - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / repTimesSec.length;
    return Math.sqrt(avgSquareDiff);
  })();

  // Handle export result
  useEffect(() => {
    if (exportResult && !exportLoading) {
      if (exportResult.ok) {
        const downloadUrl = buildExportUrl(exportResult.downloadUrlTemplate);
        if (downloadUrl) {
          downloadAndShare(downloadUrl, exportResult.filename);
        } else {
          setShareError('Could not build download URL. Check connection.');
        }
      } else {
        setShareError(exportResult.error || 'Export failed. Session not found.');
      }
      clearExportResult();
    }
  }, [exportResult, exportLoading]);

  const downloadAndShare = async (url, filename) => {
    try {
      setDownloadProgress('Downloading...');
      setShareError(null);

      const localUri = FileSystem.cacheDirectory + filename;
      const downloadResult = await FileSystem.downloadAsync(url, localUri);
      
      if (downloadResult.status !== 200) {
        throw new Error(`Download failed: ${downloadResult.status}`);
      }

      setDownloadProgress('Opening share...');

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(localUri, {
          mimeType: 'application/zip',
          dialogTitle: 'Share Session Data',
          UTI: 'public.zip-archive'
        });
        setDownloadProgress(null);
      } else {
        Alert.alert('Export Complete', `File saved: ${filename}`);
        setDownloadProgress(null);
      }
    } catch (error) {
      console.error('Download error:', error);
      setDownloadProgress(null);
      setShareError('Download failed. Check Wi-Fi connection.');
    }
  };

  const handleExport = () => {
    if (!sessionId) {
      Alert.alert('Export Error', 'No session ID available. Complete a workout first.');
      return;
    }

    if (!piIpAddress) {
      Alert.alert('Export Error', 'Not connected to device. Please reconnect.');
      return;
    }

    setShareError(null);
    requestExportSession(sessionId, 8000);
  };

  const formatValue = (value, decimals = 2, suffix = '') => {
    if (value == null) return '—';
    return `${Number(value).toFixed(decimals)}${suffix}`;
  };

  const getLossInfo = (lossPct) => {
    if (lossPct == null) return { level: 'Unknown', color: '#666' };
    if (lossPct < 10) return { level: 'Low', color: '#4CAF50' };
    if (lossPct <= 20) return { level: 'Moderate', color: '#FFC107' };
    return { level: 'High', color: '#ff4444' };
  };
  
  const fatigueInfo = getLossInfo(outputLossPct);
  const speedLossInfo = getLossInfo(speedLossPct);

  // Build rep breakdown data from rep_events (has more detail)
  const getRepBreakdownData = () => {
    if (sessionRepEvents.length > 0) {
      return sessionRepEvents.map((event, index) => ({
        rep: event.rep || index + 1,
        tempoSec: event.tempoSec,
        peakSpeedProxy: event.peakSpeedProxy,
        avgSpeedProxy: event.avgSpeedProxy,
      }));
    }
    // Fallback to just tempo data
    return repTimesSec.map((tempo, index) => ({
      rep: index + 1,
      tempoSec: tempo,
      peakSpeedProxy: null,
      avgSpeedProxy: null,
    }));
  };

  const repBreakdownData = getRepBreakdownData();

  // Find fastest/slowest for highlighting
  const tempos = repBreakdownData.map(r => r.tempoSec).filter(t => t != null);
  const minTempo = tempos.length > 0 ? Math.min(...tempos) : null;
  const maxTempo = tempos.length > 0 ? Math.max(...tempos) : null;

  // Render Peak Speed Chart
  const renderSpeedChart = () => {
    const speeds = repBreakdownData.map(r => r.peakSpeedProxy).filter(s => s != null);
    
    if (speeds.length === 0) {
      return (
        <View style={styles.noDataContainer}>
          <Text style={styles.noDataText}>No speed data available</Text>
        </View>
      );
    }

    const maxValue = Math.max(...speeds);
    const minValue = Math.min(...speeds);
    const range = (maxValue - minValue) || 1;

    const chartWidth = 300;
    const chartHeight = 100;
    const leftPadding = 40;
    const bottomPadding = 20;
    const plotWidth = chartWidth - leftPadding - 10;
    const plotHeight = chartHeight - bottomPadding - 10;

    const barWidth = Math.max(14, Math.min(30, plotWidth / speeds.length - 4));
    const spacing = (plotWidth - barWidth * speeds.length) / (speeds.length + 1);

    return (
      <Svg width={chartWidth} height={chartHeight}>
        <Line x1={leftPadding} y1={chartHeight - bottomPadding} x2={chartWidth - 10} y2={chartHeight - bottomPadding} stroke="#222" strokeWidth="1" />
        
        {speeds.map((value, index) => {
          const barHeight = Math.max(4, ((value - minValue) / range) * plotHeight);
          const x = leftPadding + spacing + index * (barWidth + spacing);
          const y = chartHeight - bottomPadding - barHeight;
          
          const firstValue = speeds[0];
          const decline = firstValue > 0 ? ((firstValue - value) / firstValue) * 100 : 0;
          let color = '#4CAF50';
          if (decline > 20) color = '#ff4444';
          else if (decline > 10) color = '#FFC107';

          return (
            <React.Fragment key={index}>
              <Rect x={x} y={y} width={barWidth} height={barHeight} fill={color} rx={2} />
              <SvgText x={x + barWidth/2} y={chartHeight - 5} fontSize="9" fill="#555" textAnchor="middle">
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
      
      <View style={styles.header}>
        <TouchableOpacity onPress={onBackToDashboard}>
          <Text style={styles.backButton}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Session Summary</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
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

        {/* Export Button */}
        <TouchableOpacity 
          style={[
            styles.exportButton,
            (exportLoading || downloadProgress) && styles.exportButtonDisabled
          ]}
          onPress={handleExport}
          disabled={exportLoading || !!downloadProgress || !sessionId}
        >
          {exportLoading || downloadProgress ? (
            <View style={styles.exportButtonContent}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.exportButtonText}>
                {downloadProgress || 'Preparing...'}
              </Text>
            </View>
          ) : (
            <Text style={styles.exportButtonText}>Export Session</Text>
          )}
        </TouchableOpacity>

        {!sessionId && (
          <Text style={styles.exportNote}>Export available after session data is received</Text>
        )}

        {shareError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{shareError}</Text>
          </View>
        )}

        {/* Speed Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Speed (proxy)</Text>
            <Text style={styles.sectionNote}>gyro-based estimate</Text>
          </View>
          
          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricBoxLabel}>Avg Peak Speed</Text>
              <Text style={styles.metricBoxValue}>{formatValue(avgPeakSpeedProxy, 0)}</Text>
              <Text style={styles.metricBoxUnit}>deg/s</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricBoxLabel}>Speed Loss</Text>
              <Text style={[styles.metricBoxValue, { color: speedLossInfo.color }]}>
                {formatValue(speedLossPct, 1, '%')}
              </Text>
              <Text style={styles.metricBoxUnit}>{speedLossInfo.level} fatigue</Text>
            </View>
          </View>

          {/* Speed Chart */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Peak Speed Per Rep</Text>
            {renderSpeedChart()}
          </View>
        </View>

        {/* Tempo Stats */}
        {repBreakdownData.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tempo Analysis</Text>
            
            <View style={styles.tempoStatsCard}>
              <View style={styles.tempoStatItem}>
                <Text style={styles.tempoStatLabel}>Fastest</Text>
                <Text style={[styles.tempoStatValue, { color: '#4CAF50' }]}>
                  {formatValue(minTempo, 2, 's')}
                </Text>
              </View>
              <View style={styles.tempoStatDivider} />
              <View style={styles.tempoStatItem}>
                <Text style={styles.tempoStatLabel}>Slowest</Text>
                <Text style={[styles.tempoStatValue, { color: '#FFC107' }]}>
                  {formatValue(maxTempo, 2, 's')}
                </Text>
              </View>
              <View style={styles.tempoStatDivider} />
              <View style={styles.tempoStatItem}>
                <Text style={styles.tempoStatLabel}>Std Dev</Text>
                <Text style={styles.tempoStatValue}>
                  {formatValue(tempoStdDev, 2, 's')}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Rep Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rep Breakdown</Text>
          
          {repBreakdownData.length > 0 ? (
            <View style={styles.repListCard}>
              {/* Header Row */}
              <View style={styles.repHeaderRow}>
                <Text style={styles.repHeaderCell}>Rep</Text>
                <Text style={styles.repHeaderCell}>Tempo</Text>
                <Text style={styles.repHeaderCell}>Peak Spd</Text>
                <Text style={styles.repHeaderCell}>Avg Spd</Text>
              </View>
              
              {repBreakdownData.map((rep, index) => {
                const isFastest = rep.tempoSec === minTempo && minTempo !== maxTempo;
                const isSlowest = rep.tempoSec === maxTempo && minTempo !== maxTempo;
                
                return (
                  <View key={index} style={styles.repDataRow}>
                    <Text style={styles.repNumCell}>{rep.rep}</Text>
                    <View style={styles.repDataCell}>
                      <Text style={[
                        styles.repDataValue,
                        isFastest && styles.fastestText,
                        isSlowest && styles.slowestText,
                      ]}>
                        {formatValue(rep.tempoSec, 2, 's')}
                      </Text>
                      {isFastest && <View style={[styles.repIndicator, { backgroundColor: '#4CAF50' }]} />}
                      {isSlowest && <View style={[styles.repIndicator, { backgroundColor: '#FFC107' }]} />}
                    </View>
                    <Text style={styles.repDataCellText}>
                      {formatValue(rep.peakSpeedProxy, 0)}
                    </Text>
                    <Text style={styles.repDataCellText}>
                      {formatValue(rep.avgSpeedProxy, 0)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.noDataContainer}>
              <Text style={styles.noDataText}>No rep data available</Text>
            </View>
          )}
        </View>

        {/* Output Loss */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Output Analysis</Text>
          
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
            </View>
            <Text style={[styles.fatigueLevelText, { color: fatigueInfo.color }]}>
              {fatigueInfo.level} Fatigue
            </Text>
          </View>
        </View>

        {/* Session Info */}
        {sessionId && (
          <View style={styles.sessionIdCard}>
            <Text style={styles.sessionIdLabel}>Session ID</Text>
            <Text style={styles.sessionIdValue}>{sessionId}</Text>
          </View>
        )}

        {/* Actions */}
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
  mainStatsCard: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1a1a1a',
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
    fontWeight: '700',
    color: '#fff',
  },
  mainStatLabel: {
    fontSize: 10,
    color: '#666',
    letterSpacing: 1,
    marginTop: 4,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: '#222',
  },
  exportButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    alignItems: 'center',
  },
  exportButtonDisabled: {
    backgroundColor: '#1e3a5f',
  },
  exportButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  exportNote: {
    fontSize: 12,
    color: '#555',
    textAlign: 'center',
    marginBottom: 16,
  },
  errorBanner: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.3)',
  },
  errorBannerText: {
    color: '#ff6666',
    fontSize: 13,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionNote: {
    fontSize: 10,
    color: '#555',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
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
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  metricBoxUnit: {
    fontSize: 10,
    color: '#555',
    marginTop: 2,
  },
  chartCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  chartTitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
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
  repListCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  repHeaderRow: {
    flexDirection: 'row',
    paddingBottom: 10,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  repHeaderCell: {
    flex: 1,
    fontSize: 10,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  repDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  repNumCell: {
    flex: 1,
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  repDataCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  repDataValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  repDataCellText: {
    flex: 1,
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
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
    marginLeft: 6,
  },
  outputLossCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  outputLossHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  outputLossLabel: {
    fontSize: 13,
    color: '#888',
  },
  outputLossValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  fatigueBarContainer: {
    marginBottom: 12,
  },
  fatigueBarBg: {
    height: 6,
    backgroundColor: '#1a1a1a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fatigueBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  fatigueLevelText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  noDataContainer: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  noDataText: {
    color: '#555',
    fontSize: 13,
  },
  sessionIdCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  sessionIdLabel: {
    fontSize: 10,
    color: '#555',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sessionIdValue: {
    fontSize: 11,
    color: '#666',
    fontFamily: 'monospace',
  },
  historyButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  historyButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  backButton2: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '500',
  },
});