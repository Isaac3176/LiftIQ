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
    lastMessage,
    repEvents,
    lastRepEvent,
    startRecording,
    stopRecording,
    disconnect 
  } = useWebSocket();

  const [chartData, setChartData] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [sessionSamples, setSessionSamples] = useState([]);
  const [wasRecording, setWasRecording] = useState(false);
  const [showRepFeedback, setShowRepFeedback] = useState(false);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const feedbackAnim = useRef(new Animated.Value(0)).current;
  const prevRepCount = useRef(0);

  // Handle rep_event for animation and haptic feedback
  useEffect(() => {
    if (!lastRepEvent || !isRecording) return;

    console.log('🎉 Rep completed!', lastRepEvent);

    // Trigger haptic feedback
    try {
      Vibration.vibrate(50); // 50ms vibration
    } catch (error) {
      console.log('Vibration not available');
    }

    // Trigger pulse animation
    triggerPulse();

    // Show rep feedback overlay
    setShowRepFeedback(true);
    Animated.sequence([
      Animated.timing(feedbackAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(800),
      Animated.timing(feedbackAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setShowRepFeedback(false));

  }, [lastRepEvent, isRecording]);
  // Monitor recording state changes
  useEffect(() => {
    if (isRecording && !wasRecording) {
      // Recording just started
      setStartTime(Date.now());
      setSessionSamples([]);
      setChartData([]);
      prevRepCount.current = 0;
      console.log('🎬 Recording started');
    } else if (!isRecording && wasRecording) {
      // Recording just stopped
      console.log('⏹️ Recording stopped');
      console.log(`📊 Session stats: ${repEvents.length} rep events recorded`);
    }
    setWasRecording(isRecording);
  }, [isRecording]);

  // Update chart and handle rep animations
  useEffect(() => {
    if (!lastMessage) return;

    // Always update chart with gyro_filt (even when not recording)
    if (lastMessage.gyro_filt !== undefined) {
      setChartData(prev => {
        const updated = [...prev, lastMessage.gyro_filt];
        return updated.slice(-100);
      });
    }

    // Only process reps and store samples when recording
    if (isRecording) {
      // Store samples
      if (lastMessage.type === 'rep_update') {
        setSessionSamples(prev => [...prev, {
          ...lastMessage,
          timestamp: Date.now()
        }]);
      }

      // Trigger animation on new rep
      if (repCount > prevRepCount.current) {
        triggerPulse();
        prevRepCount.current = repCount;
      }
    }
  }, [lastMessage, isRecording, repCount]);

  const triggerPulse = () => {
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
  };

  const handleStartWorkout = () => {
    if (isRecording) return; // Prevent double-tap
    startRecording();
  };

  const handleStopWorkout = () => {
    if (!isRecording) return; // Prevent double-tap
    stopRecording();
    
    // Calculate duration
    const duration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    
    // Calculate average rep time from rep events
    const avgRepTime = repEvents.length > 0
      ? repEvents.reduce((sum, e) => sum + e.repTime, 0) / repEvents.length
      : 0;
    
    // Calculate average confidence
    const avgConfidence = repEvents.length > 0
      ? repEvents.reduce((sum, e) => sum + e.confidence, 0) / repEvents.length
      : 0;
    
    // Navigate to summary after brief delay
    setTimeout(() => {
      onEndWorkout({
        reps: repCount,
        duration,
        samples: sessionSamples,
        repEvents: repEvents, // Include per-rep data
        avgRepTime,
        avgConfidence,
        startTime,
        endTime: Date.now(),
        avgVelocity: 0.28,
        exercise: 'Squat',
        weight: 135,
      });
    }, 500);
  };

  const handleDisconnect = () => {
    disconnect();
    onDisconnect();
  };

  const isConnected = connectionStatus === 'connected';
  const isReconnecting = connectionStatus === 'disconnected' && wasRecording;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
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
              {isReconnecting ? 'Reconnecting...' : 
               isConnected ? `Connected • ${currentState}` : 'Disconnected'}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectButton}>
          <Text style={styles.disconnectText}>⋮</Text>
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
            <Text style={styles.repFeedbackTime}>
              {lastRepEvent.time?.toFixed(2)}s
            </Text>
            <Text style={styles.repFeedbackConfidence}>
              {(lastRepEvent.confidence * 100).toFixed(0)}% confidence
            </Text>
          </Animated.View>
        )}

        {/* Large Rep Counter */}
        <View style={[
          styles.repCounterWrapper,
          !isRecording && styles.repCounterPaused
        ]}>
          <RepCounter count={repCount} pulseAnim={pulseAnim} />
          {!isRecording && repCount === 0 && (
            <Text style={styles.pausedText}>Press Start to begin counting</Text>
          )}
          {!isRecording && repCount > 0 && (
            <Text style={styles.frozenText}>🔒 Session Ended</Text>
          )}
        </View>

        {/* Recording Indicator */}
        {isRecording && (
          <View style={styles.recordingBadge}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>RECORDING</Text>
          </View>
        )}

        {/* State Indicator */}
        <View style={styles.stateCard}>
          <Text style={styles.stateLabel}>Motion Status</Text>
          <Text style={[
            styles.stateValue,
            currentState === 'MOVING' ? styles.stateMoving : 
            currentState === 'CALIBRATING' ? styles.stateCalibrating :
            styles.stateWaiting
          ]}>
            {currentState === 'WAITING' && '⏸️ Ready'}
            {currentState === 'MOVING' && '🏋️ Moving'}
            {currentState === 'CALIBRATING' && '🔄 Calibrating'}
          </Text>
          <Text style={styles.stateNote}>
            {isRecording ? 'Reps counting' : 'Reps paused'}
          </Text>
        </View>

        {/* Live Chart */}
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>
            Filtered Gyro Signal {!isRecording && '(Live Preview)'}
          </Text>
          <LiveChart data={chartData} />
          <Text style={styles.chartNote}>
            Current: {gyroFilt.toFixed(2)}
          </Text>
        </View>

        {/* Session Time */}
        {isRecording && startTime && (
          <View style={styles.timeCard}>
            <Text style={styles.timeLabel}>Session Duration</Text>
            <Text style={styles.timeValue}>
              {Math.floor((Date.now() - startTime) / 1000)}s
            </Text>
          </View>
        )}

        {/* Server Status */}
        {lastMessage && (
          <View style={styles.serverStatusCard}>
            <Text style={styles.serverStatusTitle}>Server Status</Text>
            <View style={styles.serverStatusGrid}>
              <View style={styles.serverStatusItem}>
                <Text style={styles.serverStatusLabel}>Recording:</Text>
                <Text style={[
                  styles.serverStatusValue,
                  isRecording ? styles.valueActive : styles.valueInactive
                ]}>
                  {isRecording ? '🔴 ON' : '⚪ OFF'}
                </Text>
              </View>
              <View style={styles.serverStatusItem}>
                <Text style={styles.serverStatusLabel}>Server Reps:</Text>
                <Text style={styles.serverStatusValue}>{repCount}</Text>
              </View>
              <View style={styles.serverStatusItem}>
                <Text style={styles.serverStatusLabel}>State:</Text>
                <Text style={styles.serverStatusValue}>{currentState}</Text>
              </View>
              <View style={styles.serverStatusItem}>
                <Text style={styles.serverStatusLabel}>Gyro Filt:</Text>
                <Text style={styles.serverStatusValue}>
                  {gyroFilt.toFixed(1)}
                </Text>
              </View>
            </View>
            
            {/* Latest Rep Event Debug Info */}
            {lastRepEvent && isRecording && (
              <View style={styles.repEventDebug}>
                <Text style={styles.repEventDebugTitle}>Latest Rep Event:</Text>
                <Text style={styles.repEventDebugText}>
                  Rep #{lastRepEvent.rep} • {lastRepEvent.time?.toFixed(2)}s • 
                  {(lastRepEvent.confidence * 100).toFixed(0)}% confidence
                </Text>
              </View>
            )}
            
            {/* Rep Events Summary */}
            {repEvents.length > 0 && (
              <View style={styles.repEventsSummary}>
                <Text style={styles.repEventsSummaryText}>
                  {repEvents.length} rep events recorded
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Reconnection Warning */}
        {isReconnecting && (
          <View style={styles.reconnectCard}>
            <Text style={styles.reconnectIcon}>🔄</Text>
            <Text style={styles.reconnectText}>
              Connection lost. Attempting to reconnect...
            </Text>
            <Text style={styles.reconnectSubtext}>
              Your session data is preserved
            </Text>
          </View>
        )}

        {/* Not Connected Warning */}
        {!isConnected && !isReconnecting && (
          <View style={styles.notConnectedCard}>
            <Text style={styles.notConnectedIcon}>⚠️</Text>
            <Text style={styles.notConnectedText}>
              Connection lost. Please return to connect screen.
            </Text>
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
            <Text style={styles.startButtonText}>
              {repCount > 0 ? 'Start New Session' : 'Start Workout'}
            </Text>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  backButtonContainer: {
    padding: 8,
    marginRight: 12,
  },
  backButtonText: {
    fontSize: 28,
    color: '#fff',
  },
  headerTitle: {
    fontSize: 24,
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
  disconnectButton: {
    padding: 8,
  },
  disconnectText: {
    fontSize: 24,
    color: '#888',
  },
  scrollContent: {
    padding: 20,
    position: 'relative',
  },
  repFeedback: {
    position: 'absolute',
    top: '30%',
    left: '50%',
    transform: [{ translateX: -100 }, { translateY: -50 }],
    width: 200,
    backgroundColor: '#4CAF50',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 10,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  repFeedbackText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  repFeedbackTime: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 4,
  },
  repFeedbackConfidence: {
    fontSize: 14,
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
  frozenText: {
    textAlign: 'center',
    color: '#FFC107',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 8,
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3a1a1a',
    paddingVertical: 12,
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
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  stateCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  stateLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  stateValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  stateWaiting: {
    color: '#FFC107',
  },
  stateMoving: {
    color: '#4CAF50',
  },
  stateCalibrating: {
    color: '#2196F3',
  },
  stateNote: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  chartContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  chartNote: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
  },
  timeCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
  },
  timeValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  serverStatusCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  serverStatusTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  serverStatusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  serverStatusItem: {
    width: '50%',
    marginBottom: 12,
  },
  serverStatusLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  serverStatusValue: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  valueActive: {
    color: '#ff4444',
  },
  valueInactive: {
    color: '#666',
  },
  repEventDebug: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  repEventDebugTitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 6,
  },
  repEventDebugText: {
    fontSize: 13,
    color: '#4CAF50',
    fontFamily: 'monospace',
  },
  repEventsSummary: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  repEventsSummaryText: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },
  reconnectCard: {
    backgroundColor: '#1a2a3a',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  reconnectIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  reconnectText: {
    fontSize: 16,
    color: '#2196F3',
    textAlign: 'center',
    marginBottom: 8,
  },
  reconnectSubtext: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },
  notConnectedCard: {
    backgroundColor: '#3a1a1a',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  notConnectedIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  notConnectedText: {
    fontSize: 16,
    color: '#ff4444',
    textAlign: 'center',
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
    fontSize: 20,
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
    fontSize: 20,
    fontWeight: 'bold',
  },
});