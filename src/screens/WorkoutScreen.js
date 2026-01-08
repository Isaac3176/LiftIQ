import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated, SafeAreaView, StatusBar } from 'react-native';
import { useWebSocket } from '../context/WebSocketContext';
import RepCounter from '../components/RepCounter';
import LiveChart from '../components/LiveChart';

export default function WorkoutScreen({ onDisconnect, onEndWorkout, onBack }) {
  const { 
    connectionStatus, 
    repCount, 
    currentState, 
    lastMessage,
    resetReps,
    disconnect 
  } = useWebSocket();

  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [sessionSamples, setSessionSamples] = useState([]);
  const [filteredValue, setFilteredValue] = useState(0);
  const [confidence, setConfidence] = useState(0);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const prevRepCount = useRef(0);

  // Handle incoming messages
  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'rep_update' && isWorkoutActive) {
      // Update chart with filtered value
      if (lastMessage.filt !== undefined) {
        const newValue = lastMessage.filt;
        setFilteredValue(newValue);
        
        setChartData(prev => {
          const updated = [...prev, newValue];
          return updated.slice(-100);
        });
      }

      // Store session data
      setSessionSamples(prev => [...prev, {
        ...lastMessage,
        timestamp: Date.now()
      }]);

      // Update confidence if provided
      if (lastMessage.confidence !== undefined) {
        setConfidence(lastMessage.confidence);
      }

      // Trigger animation on new rep
      if (repCount > prevRepCount.current) {
        triggerPulse();
        prevRepCount.current = repCount;
      }
    }
  }, [lastMessage, isWorkoutActive, repCount]);

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
    setIsWorkoutActive(true);
    setChartData([]);
    setSessionSamples([]);
    setStartTime(Date.now());
    resetReps(); // Reset rep counter in context
    prevRepCount.current = 0;
  };

  const handleStopWorkout = () => {
    setIsWorkoutActive(false);
    const duration = Math.floor((Date.now() - startTime) / 1000);
    
    onEndWorkout({
      reps: repCount,
      duration,
      samples: sessionSamples,
      startTime,
      endTime: Date.now(),
      avgVelocity: 0.28, // TODO: Calculate from samples
      exercise: 'Squat',
      weight: 135,
    });
  };

  const handleDisconnect = () => {
    disconnect();
    onDisconnect();
  };

  const isConnected = connectionStatus === 'connected';

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
            <View style={[styles.statusDot, isConnected ? styles.statusConnected : styles.statusDisconnected]} />
            <Text style={styles.statusText}>
              {isConnected ? `Connected • ${currentState}` : 'Disconnected'}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectButton}>
          <Text style={styles.disconnectText}>⋮</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Large Rep Counter */}
        <RepCounter count={repCount} pulseAnim={pulseAnim} />

        {/* State Indicator */}
        {isWorkoutActive && (
          <View style={styles.stateCard}>
            <Text style={styles.stateLabel}>Status</Text>
            <Text style={[
              styles.stateValue,
              currentState === 'MOVING' ? styles.stateMoving : styles.stateWaiting
            ]}>
              {currentState === 'CALIBRATING' && '🔄 Calibrating...'}
              {currentState === 'WAITING' && '⏸️ Ready'}
              {currentState === 'MOVING' && '🏋️ Moving'}
            </Text>
            {confidence > 0 && (
              <Text style={styles.confidenceText}>
                Confidence: {(confidence * 100).toFixed(0)}%
              </Text>
            )}
          </View>
        )}

        {/* Live Chart */}
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>
            Filtered Signal (Gyro Magnitude)
          </Text>
          <LiveChart data={chartData} />
          <Text style={styles.chartNote}>
            Current: {filteredValue.toFixed(2)} rad/s
          </Text>
        </View>

        {/* Raw Data Display */}
        {lastMessage && (
          <View style={styles.rawDataContainer}>
            <Text style={styles.rawDataTitle}>Latest Data</Text>
            <View style={styles.rawDataGrid}>
              <View style={styles.rawDataItem}>
                <Text style={styles.rawDataLabel}>Time:</Text>
                <Text style={styles.rawDataValue}>
                  {lastMessage.t?.toFixed(2) || 'N/A'}s
                </Text>
              </View>
              <View style={styles.rawDataItem}>
                <Text style={styles.rawDataLabel}>Reps:</Text>
                <Text style={styles.rawDataValue}>{lastMessage.reps || 0}</Text>
              </View>
              <View style={styles.rawDataItem}>
                <Text style={styles.rawDataLabel}>State:</Text>
                <Text style={styles.rawDataValue}>{lastMessage.state || 'N/A'}</Text>
              </View>
              <View style={styles.rawDataItem}>
                <Text style={styles.rawDataLabel}>Filtered:</Text>
                <Text style={styles.rawDataValue}>
                  {lastMessage.filt?.toFixed(2) || 'N/A'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Instructions when not connected */}
        {!isConnected && (
          <View style={styles.notConnectedCard}>
            <Text style={styles.notConnectedIcon}>⚠️</Text>
            <Text style={styles.notConnectedText}>
              Connection lost. Please return to the connect screen.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {!isWorkoutActive ? (
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
  confidenceText: {
    fontSize: 12,
    color: '#888',
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
  rawDataContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  rawDataTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  rawDataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  rawDataItem: {
    width: '50%',
    marginBottom: 8,
  },
  rawDataLabel: {
    fontSize: 12,
    color: '#888',
  },
  rawDataValue: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: 'bold',
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