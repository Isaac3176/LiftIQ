import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated, SafeAreaView, StatusBar, Vibration } from 'react-native';
import { useWebSocket } from '../context/WebSocketContext';
import RepCounter from '../components/RepCounter';
import LiveChart from '../components/LiveChart';

export default function WorkoutScreen({ onDisconnect, onEndWorkout, onBack }) {
  const { 
    connectionStatus, 
    // Authoritative from server (via rep_update)
    repCount,
    currentState,
    isRecording,
    gyroFilt,
    liveTutSec,
    liveAvgTempoSec,
    liveOutputLossPct,
    // Rep events (for animation)
    repEvents,
    lastRepEvent,
    currentSessionSummary,
    // Methods
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

  // Animate ONLY on rep_event (not on repCount change)
  useEffect(() => {
    if (!lastRepEvent || !isRecording) return;
    
    // Prevent duplicate animations for same rep
    if (lastRepEvent.rep <= lastAnimatedRep.current) return;
    lastAnimatedRep.current = lastRepEvent.rep;

    console.log('🎉 Animating rep:', lastRepEvent.rep);

    // Haptic feedback
    try {
      Vibration.vibrate(50);
    } catch (e) {}

    // Pulse animation
    Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 1.3,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    // Feedback overlay
    setShowRepFeedback(true);
    Animated.sequence([
      Animated.timing(feedbackAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(700),
      Animated.timing(feedbackAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setShowRepFeedback(false));

  }, [lastRepEvent, isRecording]);

  // Track session start for local timer display
  useEffect(() => {
    if (isRecording && !sessionStartTime) {
      setSessionStartTime(Date.now());
      lastAnimatedRep.current = 0;
    } else if (!isRecording && sessionStartTime) {
      setSessionStartTime(null);
    }
  }, [isRecording]);

  // Update chart data
  useEffect(() => {
    if (gyroFilt !== undefined) {
      setChartData(prev => {
        const updated = [...prev, gyroFilt];
        return updated.slice(-100);
      });
    }
  }, [gyroFilt]);

  const handleStartWorkout = () => {
    setChartData([]);
    startRecording();
  };

  const handleStopWorkout = () => {
    stopRecording();
    
    // Wait for session_summary then navigate
    setTimeout(() => {
      onEndWorkout({
        // Pass server summary as source of truth
        serverSummary: currentSessionSummary,
        repEvents: repEvents,
        // Fallback values if summary not received
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

  // Format helpers
  const formatValue = (value, decimals = 1, suffix = '') => {
    if (value == null || value === undefined) return '—';
    return `${Number(value).toFixed(decimals)}${suffix}`;
  };

  // State color helper
  const getStateStyle = () => {
    switch (currentState) {
      case 'MOVING': return styles.stateMoving;
      case 'CALIBRATING': return styles.stateCalibrating;
      default: return styles.stateWaiting;
    }
  };

  const getStateIcon = () => {
    switch (currentState) {
      case 'MOVING': return '🏋️';
      case 'CALIBRATING': return '🔄';
      default: return '⏸️';
    }
  };

  // Output loss color
  const getOutputLossStyle = () => {
    if (liveOutputLossPct == null) return {};
    if (liveOutputLossPct > 20) return { color: '#ff4444' };
    if (liveOutputLossPct > 10) return { color: '#FFC107' };
    return { color: '#4CAF50' };
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButtonContainer}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Live Workout</Text>
          <View style={styles.statusContainer}>
            <View style={[
              styles.statusDot, 
              isConnected ? styles.statusConnected : styles.statusDisconnected
            ]} />
            <Text style={styles.statusText}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleDisconnect} style={styles.menuButton}>
          <Text style={styles.menuButtonText}>⋮</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Rep Feedback Overlay */}
        {showRepFeedback && lastRepEvent && (
          <Animated.View style={[
            styles.repFeedback,
            {
              opacity: feedbackAnim,
              transform: [{
                scale: feedbackAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.5, 1]
                })
              }]
            }
          ]}>
            <Text style={styles.repFeedbackText}>+1 REP</Text>
            {lastRepEvent.peakGyro != null && (
              <Text style={styles.repFeedbackPeakGyro}>
                ⚡ {lastRepEvent.peakGyro.toFixed(0)}
              </Text>
            )}
            <Text style={styles.repFeedbackConfidence}>
              {(lastRepEvent.confidence * 100).toFixed(0)}% confidence
            </Text>
          </Animated.View>
        )}

        {/* Large Rep Counter */}
        <View style={[styles.repCounterWrapper, !isRecording && styles.repCounterPaused]}>
          <RepCounter count={repCount} pulseAnim={pulseAnim} />
          {!isRecording && repCount === 0 && (
            <Text style={styles.pausedText}>Press Start to begin</Text>
          )}
        </View>

        {/* Recording Indicator */}
        {isRecording && (
          <View style={styles.recordingBadge}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>RECORDING</Text>
          </View>
        )}

        {/* Motion State Card */}
        <View style={styles.stateCard}>
          <Text style={styles.stateLabel}>Motion Status</Text>
          <Text style={[styles.stateValue, getStateStyle()]}>
            {getStateIcon()} {currentState}
          </Text>
        </View>

        {/* Live Metrics Grid */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>TUT</Text>
            <Text style={styles.metricValue}>{formatValue(liveTutSec, 1, 's')}</Text>
            <Text style={styles.metricSource}>From Device</Text>
          </View>
          
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Avg Tempo</Text>
            <Text style={styles.metricValue}>{formatValue(liveAvgTempoSec, 2, 's')}</Text>
            <Text style={styles.metricSource}>From Device</Text>
          </View>
          
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Output Loss</Text>
            <Text style={[styles.metricValue, getOutputLossStyle()]}>
              {formatValue(liveOutputLossPct, 1, '%')}
            </Text>
            <Text style={styles.metricSource}>Fatigue Proxy</Text>
          </View>
        </View>

        {/* Live Chart */}
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>Gyro Signal</Text>
          <LiveChart data={chartData} />
          <Text style={styles.chartNote}>
            Current: {gyroFilt.toFixed(1)}
          </Text>
        </View>

        {/* Rep Events Debug */}
        {repEvents.length > 0 && (
          <View style={styles.repEventsCard}>
            <Text style={styles.repEventsTitle}>Rep Events ({repEvents.length})</Text>
            <View style={styles.repEventsList}>
              {repEvents.slice(-5).map((event, i) => (
                <Text key={i} style={styles.repEventItem}>
                  Rep {event.rep}: t={event.t?.toFixed(2)}s, peak={event.peakGyro?.toFixed(0) || '—'}
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* Not Connected Warning */}
        {!isConnected && (
          <View style={styles.notConnectedCard}>
            <Text style={styles.notConnectedIcon}>📡</Text>
            <Text style={styles.notConnectedText}>Connection lost</Text>
          </View>
        )}
      </ScrollView>

      {/* Footer with Start/Stop Button */}
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
            <Text style={styles.stopButtonText}>Stop & View Summary</Text>
          </TouchableOpacity>
        )}
      </View>
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
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  backButtonContainer: {
    padding: 8,
    marginRight: 8,
  },
  backButtonText: {
    fontSize: 24,
    color: '#fff',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusConnected: {
    backgroundColor: '#4CAF50',
  },
  statusDisconnected: {
    backgroundColor: '#ff4444',
  },
  statusText: {
    fontSize: 12,
    color: '#888',
  },
  menuButton: {
    padding: 8,
  },
  menuButtonText: {
    fontSize: 24,
    color: '#888',
  },
  scrollContent: {
    padding: 20,
    position: 'relative',
  },
  repFeedback: {
    position: 'absolute',
    top: '25%',
    left: '50%',
    transform: [{ translateX: -90 }],
    width: 180,
    backgroundColor: '#4CAF50',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 10,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  repFeedbackText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  repFeedbackPeakGyro: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 4,
  },
  repFeedbackConfidence: {
    fontSize: 12,
    color: '#ddd',
  },
  repCounterWrapper: {
    marginBottom: 20,
  },
  repCounterPaused: {
    opacity: 0.6,
  },
  pausedText: {
    textAlign: 'center',
    color: '#888',
    fontSize: 14,
    marginTop: 8,
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3a1a1a',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginBottom: 20,
    alignSelf: 'center',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ff4444',
    marginRight: 8,
  },
  recordingText: {
    color: '#ff4444',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  stateCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  stateLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  stateValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  stateWaiting: {
    color: '#888',
  },
  stateMoving: {
    color: '#4CAF50',
  },
  stateCalibrating: {
    color: '#666',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  metricSource: {
    fontSize: 9,
    color: '#555',
    marginTop: 4,
  },
  chartContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  chartNote: {
    fontSize: 11,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
  },
  repEventsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  repEventsTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#888',
    marginBottom: 8,
  },
  repEventsList: {},
  repEventItem: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  notConnectedCard: {
    backgroundColor: '#3a1a1a',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  notConnectedIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  notConnectedText: {
    fontSize: 14,
    color: '#ff4444',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  startButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#333',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  stopButton: {
    backgroundColor: '#ff4444',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});