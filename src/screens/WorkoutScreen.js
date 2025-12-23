import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated } from 'react-native';
import RepCounter from '../components/RepCounter';
import LiveChart from '../components/LiveChart';
import { detectRep, resetRepDetector } from '../utils/repDetection';

export default function WorkoutScreen({ websocket, onDisconnect, onEndWorkout }) {
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [repCount, setRepCount] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [rawData, setRawData] = useState({ ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 });
  const [startTime, setStartTime] = useState(null);
  const [sessionSamples, setSessionSamples] = useState([]);
  const [isConnected, setIsConnected] = useState(true);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!websocket) return;

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Safely extract values with defaults
        const safeData = {
          ax: typeof data.ax === 'number' ? data.ax : 0,
          ay: typeof data.ay === 'number' ? data.ay : 0,
          az: typeof data.az === 'number' ? data.az : 0,
          gx: typeof data.gx === 'number' ? data.gx : 0,
          gy: typeof data.gy === 'number' ? data.gy : 0,
          gz: typeof data.gz === 'number' ? data.gz : 0,
        };
        
        setRawData(safeData);

        if (isWorkoutActive) {
          setSessionSamples(prev => [...prev, { ...safeData, timestamp: Date.now() }]);

          const newMagnitude = Math.sqrt(
            safeData.ax * safeData.ax + 
            safeData.ay * safeData.ay + 
            safeData.az * safeData.az
          );

          setChartData(prev => {
            const updated = [...prev, newMagnitude];
            return updated.slice(-100);
          });

          const repDetected = detectRep(newMagnitude);
          if (repDetected) {
            setRepCount(prev => prev + 1);
            triggerPulse();
          }
        }
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };

    websocket.onclose = () => {
      console.log('WebSocket closed');
      setIsConnected(false);
      alert('Connection closed. Returning to connect screen.');
      onDisconnect();
    };

    return () => {
      if (websocket) {
        websocket.onmessage = null;
        websocket.onerror = null;
        websocket.onclose = null;
      }
    };
  }, [websocket, isWorkoutActive]);

  const triggerPulse = () => {
    Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 1.2,
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
    setRepCount(0);
    setChartData([]);
    setSessionSamples([]);
    setStartTime(Date.now());
    resetRepDetector();
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
    });
  };

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
            <Text style={styles.statusText}>{isConnected ? 'Connected' : 'Disconnected'}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onDisconnect} style={styles.disconnectButton}>
          <Text style={styles.disconnectText}>⋮</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <RepCounter count={repCount} pulseAnim={pulseAnim} />

        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>Acceleration Magnitude</Text>
          <LiveChart data={chartData} />
        </View>

        <View style={styles.rawDataContainer}>
          <Text style={styles.rawDataTitle}>Raw IMU Data</Text>
          <View style={styles.rawDataGrid}>
            <View style={styles.rawDataItem}>
              <Text style={styles.rawDataLabel}>Accel X:</Text>
              <Text style={styles.rawDataValue}>{rawData.ax.toFixed(2)}</Text>
            </View>
            <View style={styles.rawDataItem}>
              <Text style={styles.rawDataLabel}>Accel Y:</Text>
              <Text style={styles.rawDataValue}>{rawData.ay.toFixed(2)}</Text>
            </View>
            <View style={styles.rawDataItem}>
              <Text style={styles.rawDataLabel}>Accel Z:</Text>
              <Text style={styles.rawDataValue}>{rawData.az.toFixed(2)}</Text>
            </View>
            <View style={styles.rawDataItem}>
              <Text style={styles.rawDataLabel}>Gyro X:</Text>
              <Text style={styles.rawDataValue}>{rawData.gx.toFixed(2)}</Text>
            </View>
            <View style={styles.rawDataItem}>
              <Text style={styles.rawDataLabel}>Gyro Y:</Text>
              <Text style={styles.rawDataValue}>{rawData.gy.toFixed(2)}</Text>
            </View>
            <View style={styles.rawDataItem}>
              <Text style={styles.rawDataLabel}>Gyro Z:</Text>
              <Text style={styles.rawDataValue}>{rawData.gz.toFixed(2)}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {!isWorkoutActive ? (
          <TouchableOpacity style={styles.startButton} onPress={handleStartWorkout}>
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
  backButtonContainer: {
    padding: 8,
    marginRight: 12,
  },
  backButtonText: {
    fontSize: 28,
    color: '#fff',
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