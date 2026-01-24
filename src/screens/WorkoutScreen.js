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

  // Animate ONLY on rep_event
  useEffect(() => {
    if (!lastRepEvent || !isRecording) return;
    if (lastRepEvent.rep <= lastAnimatedRep.current) return;
    lastAnimatedRep.current = lastRepEvent.rep;

    try {
      Vibration.vibrate(50);
    } catch (e) {}

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
    if (value == null || value === undefined) return '—';
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

  const getOutputLossStyle = () => {
    if (liveOutputLossPct == null) return {};
    if (liveOutputLossPct > 20) return { color: '#ff4444' };
    if (liveOutputLossPct > 10) return { color: '#FFC107' };
    return { color: '#4CAF50' };
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
          <Text style={styles.menuButtonText}>•••</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
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
            <Text style={styles.repFeedbackText}>+1</Text>
            {lastRepEvent.peakGyro != null && (
              <Text style={styles.repFeedbackPeakGyro}>
                {lastRepEvent.peakGyro.toFixed(0)}
              </Text>
            )}
          </Animated.View>
        )}

        <View style={[styles.repCounterWrapper, !isRecording && styles.repCounterPaused]}>
          <RepCounter count={repCount} pulseAnim={pulseAnim} />
          {!isRecording && repCount === 0 && (
            <Text style={styles.pausedText}>Press Start to begin</Text>
          )}
        </View>

        {isRecording && (
          <View style={styles.recordingBadge}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>RECORDING</Text>
          </View>
        )}

        <View style={styles.stateCard}>
          <Text style={styles.stateLabel}>Status</Text>
          <Text style={[styles.stateValue, getStateStyle()]}>
            {getStateLabel()}
          </Text>
        </View>

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
            <Text style={[styles.metricValue, getOutputLossStyle()]}>
              {formatValue(liveOutputLossPct, 1, '%')}
            </Text>
          </View>
        </View>

        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>Gyro Signal</Text>
          <LiveChart data={chartData} />
          <Text style={styles.chartNote}>
            Current: {gyroFilt.toFixed(1)}
          </Text>
        </View>

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

        {!isConnected && (
          <View style={styles.notConnectedCard}>
            <Text style={styles.notConnectedText}>Connection lost</Text>
          </View>
        )}
      </ScrollView>

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
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButtonContainer: {
    padding: 8,
    marginRight: 8,
  },
  backButtonText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
    color: '#666',
  },
  menuButton: {
    padding: 8,
  },
  menuButtonText: {
    fontSize: 16,
    color: '#666',
    letterSpacing: 2,
  },
  scrollContent: {
    padding: 20,
    position: 'relative',
  },
  repFeedback: {
    position: 'absolute',
    top: '25%',
    left: '50%',
    transform: [{ translateX: -60 }],
    width: 120,
    backgroundColor: '#4CAF50',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 10,
  },
  repFeedbackText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  repFeedbackPeakGyro: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  repCounterWrapper: {
    marginBottom: 20,
  },
  repCounterPaused: {
    opacity: 0.5,
  },
  pausedText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginBottom: 20,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.3)',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff4444',
    marginRight: 8,
  },
  recordingText: {
    color: '#ff4444',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  stateCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  stateLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  stateValue: {
    fontSize: 18,
    fontWeight: '600',
  },
  stateWaiting: {
    color: '#666',
  },
  stateMoving: {
    color: '#4CAF50',
  },
  stateCalibrating: {
    color: '#888',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  metricLabel: {
    fontSize: 10,
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  chartContainer: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  chartTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginBottom: 12,
  },
  chartNote: {
    fontSize: 11,
    color: '#555',
    marginTop: 8,
    textAlign: 'center',
  },
  repEventsCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  repEventsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  repEventsList: {},
  repEventItem: {
    fontSize: 11,
    color: '#555',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  notConnectedCard: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.3)',
  },
  notConnectedText: {
    fontSize: 14,
    color: '#ff4444',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
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
    fontSize: 16,
    fontWeight: '600',
  },
  stopButton: {
    backgroundColor: '#ff4444',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});