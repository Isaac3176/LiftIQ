import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated, SafeAreaView, StatusBar, Vibration } from 'react-native';
import { useWebSocket } from '../context/WebSocketContext';
import RepCounter from '../components/RepCounter';
import LiveChart from '../components/LiveChart';

export default function WorkoutScreen({ onDisconnect, onEndWorkout, onBack }) {
  const { 
    connectionStatus, 
    repCount,
    currentState,
    isRecording,
    gyroFilt,
    liveTutSec,
    liveAvgTempoSec,
    liveOutputLossPct,
    liveAvgPeakSpeedProxy,
    liveSpeedLossPct,
    // ML Pipeline fields
    liveVelocity,
    liveDisplacement,
    liveRoll,
    livePitch,
    liveAvgVelocityMs,
    liveVelocityLossPct,
    liveAvgRomM,
    liveRomLossPct,
    repEvents,
    lastRepEvent,
    currentSessionSummary,
    startRecording,
    stopRecording,
    disconnect 
  } = useWebSocket();

  const [chartData, setChartData] = useState([]);
  const [showRepFeedback, setShowRepFeedback] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const feedbackAnim = useRef(new Animated.Value(0)).current;
  const lastAnimatedRep = useRef(0);

  // Check if ML pipeline data is available
  const hasVelocityData = liveVelocity !== 0 || liveAvgVelocityMs != null;
  const hasRomData = liveDisplacement !== 0 || liveAvgRomM != null;

  useEffect(() => {
    if (!lastRepEvent || !isRecording) return;
    if (lastRepEvent.rep <= lastAnimatedRep.current) return;
    lastAnimatedRep.current = lastRepEvent.rep;

    try { Vibration.vibrate(50); } catch (e) {}

    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.3, duration: 150, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();

    setShowRepFeedback(true);
    Animated.sequence([
      Animated.timing(feedbackAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(800),
      Animated.timing(feedbackAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setShowRepFeedback(false));
  }, [lastRepEvent, isRecording]);

  useEffect(() => {
    if (isRecording && !sessionStartTime) {
      setSessionStartTime(Date.now());
      lastAnimatedRep.current = 0;
    } else if (!isRecording && sessionStartTime) {
      setSessionStartTime(null);
    }
  }, [isRecording]);

  useEffect(() => {
    if (gyroFilt !== undefined) {
      setChartData(prev => [...prev, gyroFilt].slice(-100));
    }
  }, [gyroFilt]);

  const handleStartWorkout = () => {
    setChartData([]);
    startRecording();
  };

  const handleStopWorkout = () => {
    stopRecording();
    setTimeout(() => {
      onEndWorkout({
        serverSummary: currentSessionSummary,
        repEvents: repEvents,
        reps: repCount,
        duration: sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0,
      });
    }, 1000);
  };

  const handleDisconnect = () => {
    disconnect();
    onDisconnect();
  };

  const isConnected = connectionStatus === 'connected';

  const formatValue = (value, decimals = 1, suffix = '') => {
    if (value == null) return '—';
    return `${Number(value).toFixed(decimals)}${suffix}`;
  };

  const getStateStyle = () => {
    switch (currentState) {
      case 'MOVING': return styles.stateMoving;
      case 'CALIBRATING': return styles.stateCalibrating;
      default: return styles.stateWaiting;
    }
  };

  const getStateLabel = () => {
    switch (currentState) {
      case 'MOVING': return 'Active';
      case 'CALIBRATING': return 'Calibrating';
      default: return 'Ready';
    }
  };

  const getLossStyle = (value, warningThreshold = 15, dangerThreshold = 25) => {
    if (value == null) return {};
    if (value > dangerThreshold) return { color: '#ff4444' };
    if (value > warningThreshold) return { color: '#FFC107' };
    return { color: '#4CAF50' };
  };

  const getVelocityColor = (velocity) => {
    if (velocity == null) return '#666';
    const v = Math.abs(velocity);
    if (v > 0.8) return '#4CAF50';
    if (v > 0.4) return '#FFC107';
    return '#666';
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButtonContainer}>
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Live Workout</Text>
          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, isConnected ? styles.statusConnected : styles.statusDisconnected]} />
            <Text style={styles.statusText}>{isConnected ? 'Connected' : 'Disconnected'}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleDisconnect} style={styles.menuButton}>
          <Text style={styles.menuButtonText}>•••</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Rep Feedback Popup */}
        {showRepFeedback && lastRepEvent && (
          <Animated.View style={[styles.repFeedback, {
            opacity: feedbackAnim,
            transform: [{ scale: feedbackAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }]
          }]}>
            <Text style={styles.repFeedbackText}>+1</Text>
            {lastRepEvent.peakVelocityMs != null ? (
              <Text style={styles.repFeedbackDetail}>{lastRepEvent.peakVelocityMs.toFixed(2)} m/s</Text>
            ) : lastRepEvent.peakSpeedProxy != null ? (
              <Text style={styles.repFeedbackDetail}>{lastRepEvent.peakSpeedProxy.toFixed(0)} peak</Text>
            ) : null}
            {lastRepEvent.romCm != null && (
              <Text style={styles.repFeedbackRom}>{lastRepEvent.romCm.toFixed(0)} cm</Text>
            )}
          </Animated.View>
        )}

        {/* Rep Counter */}
        <View style={[styles.repCounterWrapper, !isRecording && styles.repCounterPaused]}>
          <RepCounter count={repCount} pulseAnim={pulseAnim} />
          {!isRecording && repCount === 0 && (
            <Text style={styles.pausedText}>Press Start to begin</Text>
          )}
        </View>

        {/* Recording Badge */}
        {isRecording && (
          <View style={styles.recordingBadge}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>RECORDING</Text>
          </View>
        )}

        {/* State Card */}
        <View style={styles.stateCard}>
          <Text style={styles.stateLabel}>Status</Text>
          <Text style={[styles.stateValue, getStateStyle()]}>{getStateLabel()}</Text>
        </View>

        {/* Live Velocity Display (if ML pipeline active) */}
        {hasVelocityData && (
          <View style={styles.velocityCard}>
            <Text style={styles.velocityLabel}>Bar Velocity</Text>
            <Text style={[styles.velocityValue, { color: getVelocityColor(liveVelocity) }]}>
              {formatValue(Math.abs(liveVelocity), 2)} m/s
            </Text>
            <View style={styles.velocityBar}>
              <View style={[styles.velocityBarFill, { 
                width: `${Math.min(100, Math.abs(liveVelocity || 0) * 100)}%`,
                backgroundColor: getVelocityColor(liveVelocity)
              }]} />
            </View>
            {liveDisplacement !== 0 && (
              <Text style={styles.displacementText}>
                Displacement: {(Math.abs(liveDisplacement) * 100).toFixed(1)} cm
              </Text>
            )}
          </View>
        )}

        {/* Primary Metrics */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>TUT</Text>
            <Text style={styles.metricValue}>{formatValue(liveTutSec, 1, 's')}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Avg Tempo</Text>
            <Text style={styles.metricValue}>{formatValue(liveAvgTempoSec, 2, 's')}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Output Loss</Text>
            <Text style={[styles.metricValue, getLossStyle(liveOutputLossPct)]}>
              {formatValue(liveOutputLossPct, 1, '%')}
            </Text>
          </View>
        </View>

        {/* ML Pipeline Velocity Stats (if available) */}
        {hasVelocityData && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Velocity</Text>
              <Text style={styles.sectionNote}>physics-based</Text>
            </View>
            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Avg Velocity</Text>
                <Text style={styles.metricValue}>{formatValue(liveAvgVelocityMs, 2)} m/s</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Velocity Loss</Text>
                <Text style={[styles.metricValue, getLossStyle(liveVelocityLossPct, 15, 25)]}>
                  {formatValue(liveVelocityLossPct, 1, '%')}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* ML Pipeline ROM Stats (if available) */}
        {hasRomData && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Range of Motion</Text>
            </View>
            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Avg ROM</Text>
                <Text style={styles.metricValue}>
                  {liveAvgRomM != null ? `${(liveAvgRomM * 100).toFixed(0)} cm` : '—'}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>ROM Loss</Text>
                <Text style={[styles.metricValue, getLossStyle(liveRomLossPct, 10, 20)]}>
                  {formatValue(liveRomLossPct, 1, '%')}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Speed Proxy (gyro-based fallback) */}
        {!hasVelocityData && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Speed (proxy)</Text>
              <Text style={styles.sectionNote}>gyro-based</Text>
            </View>
            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Avg Peak Speed</Text>
                <Text style={styles.metricValue}>{formatValue(liveAvgPeakSpeedProxy, 0)}</Text>
                <Text style={styles.metricUnit}>deg/s</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Speed Loss</Text>
                <Text style={[styles.metricValue, getLossStyle(liveSpeedLossPct)]}>
                  {formatValue(liveSpeedLossPct, 1, '%')}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Orientation (if available) */}
        {(liveRoll !== 0 || livePitch !== 0) && (
          <View style={styles.orientationCard}>
            <Text style={styles.orientationTitle}>Bar Tilt</Text>
            <View style={styles.orientationRow}>
              <View style={styles.orientationItem}>
                <Text style={styles.orientationLabel}>Roll</Text>
                <Text style={styles.orientationValue}>{formatValue(liveRoll, 1)}°</Text>
              </View>
              <View style={styles.orientationItem}>
                <Text style={styles.orientationLabel}>Pitch</Text>
                <Text style={styles.orientationValue}>{formatValue(livePitch, 1)}°</Text>
              </View>
            </View>
          </View>
        )}

        {/* Last Rep Info */}
        {lastRepEvent && isRecording && (
          <View style={styles.lastRepCard}>
            <Text style={styles.lastRepTitle}>Last Rep (#{lastRepEvent.rep})</Text>
            <View style={styles.lastRepStats}>
              {lastRepEvent.peakVelocityMs != null ? (
                <>
                  <View style={styles.lastRepStat}>
                    <Text style={styles.lastRepLabel}>Peak Vel</Text>
                    <Text style={styles.lastRepValue}>{formatValue(lastRepEvent.peakVelocityMs, 2)} m/s</Text>
                  </View>
                  <View style={styles.lastRepDivider} />
                </>
              ) : (
                <>
                  <View style={styles.lastRepStat}>
                    <Text style={styles.lastRepLabel}>Peak Speed</Text>
                    <Text style={styles.lastRepValue}>{formatValue(lastRepEvent.peakSpeedProxy, 0)}</Text>
                  </View>
                  <View style={styles.lastRepDivider} />
                </>
              )}
              <View style={styles.lastRepStat}>
                <Text style={styles.lastRepLabel}>Tempo</Text>
                <Text style={styles.lastRepValue}>{formatValue(lastRepEvent.tempoSec, 2, 's')}</Text>
              </View>
              {lastRepEvent.romCm != null && (
                <>
                  <View style={styles.lastRepDivider} />
                  <View style={styles.lastRepStat}>
                    <Text style={styles.lastRepLabel}>ROM</Text>
                    <Text style={styles.lastRepValue}>{formatValue(lastRepEvent.romCm, 0)} cm</Text>
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        {/* Gyro Chart */}
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>Gyro Signal</Text>
          <LiveChart data={chartData} />
          <Text style={styles.chartNote}>Current: {gyroFilt.toFixed(1)}</Text>
        </View>

        {!isConnected && (
          <View style={styles.notConnectedCard}>
            <Text style={styles.notConnectedText}>Connection lost</Text>
          </View>
        )}
      </ScrollView>

      {/* Footer Buttons */}
      <View style={styles.footer}>
        {!isRecording ? (
          <TouchableOpacity 
            style={[styles.startButton, !isConnected && styles.buttonDisabled]}
            onPress={handleStartWorkout}
            disabled={!isConnected}
          >
            <Text style={styles.startButtonText}>Start Workout</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.stopButton} onPress={handleStopWorkout}>
            <Text style={styles.stopButtonText}>Stop Workout</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  backButtonContainer: { padding: 8, marginRight: 8 },
  backButtonText: { fontSize: 28, color: '#fff', fontWeight: '300' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  statusContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusConnected: { backgroundColor: '#4CAF50' },
  statusDisconnected: { backgroundColor: '#ff4444' },
  statusText: { fontSize: 12, color: '#666' },
  menuButton: { padding: 8 },
  menuButtonText: { fontSize: 16, color: '#666', letterSpacing: 2 },
  scrollContent: { padding: 20, position: 'relative' },
  repFeedback: {
    position: 'absolute', top: '15%', left: '50%', transform: [{ translateX: -75 }],
    width: 150, backgroundColor: '#4CAF50', borderRadius: 16, padding: 16,
    alignItems: 'center', zIndex: 1000, elevation: 10,
  },
  repFeedbackText: { fontSize: 32, fontWeight: '700', color: '#fff' },
  repFeedbackDetail: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  repFeedbackRom: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  repCounterWrapper: { marginBottom: 20 },
  repCounterPaused: { opacity: 0.5 },
  pausedText: { textAlign: 'center', color: '#666', fontSize: 14, marginTop: 8 },
  recordingBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255, 68, 68, 0.1)', paddingVertical: 10, paddingHorizontal: 20,
    borderRadius: 20, marginBottom: 20, alignSelf: 'center',
    borderWidth: 1, borderColor: 'rgba(255, 68, 68, 0.3)',
  },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff4444', marginRight: 8 },
  recordingText: { color: '#ff4444', fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  stateCard: {
    backgroundColor: '#111', borderRadius: 12, padding: 16, marginBottom: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#1a1a1a',
  },
  stateLabel: { fontSize: 11, color: '#666', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  stateValue: { fontSize: 18, fontWeight: '600' },
  stateWaiting: { color: '#666' },
  stateMoving: { color: '#4CAF50' },
  stateCalibrating: { color: '#888' },
  velocityCard: {
    backgroundColor: '#111', borderRadius: 12, padding: 16, marginBottom: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#1a1a1a',
  },
  velocityLabel: { fontSize: 11, color: '#666', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  velocityValue: { fontSize: 32, fontWeight: '700' },
  velocityBar: { 
    width: '100%', height: 6, backgroundColor: '#222', borderRadius: 3, 
    marginTop: 12, overflow: 'hidden' 
  },
  velocityBarFill: { height: '100%', borderRadius: 3 },
  displacementText: { fontSize: 12, color: '#666', marginTop: 8 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: 10, marginTop: 8,
  },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionNote: { fontSize: 10, color: '#555' },
  metricsGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  metricCard: {
    flex: 1, backgroundColor: '#111', borderRadius: 12, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#1a1a1a',
  },
  metricLabel: { fontSize: 10, color: '#666', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricValue: { fontSize: 16, fontWeight: '600', color: '#fff' },
  metricUnit: { fontSize: 9, color: '#555', marginTop: 2 },
  orientationCard: {
    backgroundColor: '#111', borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#1a1a1a',
  },
  orientationTitle: { fontSize: 11, fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, textAlign: 'center' },
  orientationRow: { flexDirection: 'row', justifyContent: 'space-around' },
  orientationItem: { alignItems: 'center' },
  orientationLabel: { fontSize: 10, color: '#555', marginBottom: 4 },
  orientationValue: { fontSize: 16, fontWeight: '600', color: '#fff' },
  lastRepCard: {
    backgroundColor: '#111', borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#1a1a1a',
  },
  lastRepTitle: { fontSize: 11, fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, textAlign: 'center' },
  lastRepStats: { flexDirection: 'row', alignItems: 'center' },
  lastRepStat: { flex: 1, alignItems: 'center' },
  lastRepLabel: { fontSize: 9, color: '#555', marginBottom: 4 },
  lastRepValue: { fontSize: 15, fontWeight: '600', color: '#4CAF50' },
  lastRepDivider: { width: 1, height: 28, backgroundColor: '#222' },
  chartContainer: {
    backgroundColor: '#111', borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#1a1a1a',
  },
  chartTitle: { fontSize: 13, fontWeight: '600', color: '#888', marginBottom: 12 },
  chartNote: { fontSize: 11, color: '#555', marginTop: 8, textAlign: 'center' },
  notConnectedCard: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)', borderRadius: 12, padding: 20,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255, 68, 68, 0.3)',
  },
  notConnectedText: { fontSize: 14, color: '#ff4444' },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  startButton: { backgroundColor: '#4CAF50', borderRadius: 12, padding: 18, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#333' },
  startButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  stopButton: { backgroundColor: '#ff4444', borderRadius: 12, padding: 18, alignItems: 'center' },
  stopButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});