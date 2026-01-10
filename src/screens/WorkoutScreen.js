// WorkoutScreen.js
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useWebSocket } from '../context/WebSocketContext';
import RepCounter from '../components/RepCounter';
import LiveChart from '../components/LiveChart';

export default function WorkoutScreen({ onDisconnect, onEndWorkout, onBack }) {
  const {
    connectionStatus,
    repCount,
    currentState,
    isRecording, // SERVER SOURCE OF TRUTH
    gyroFilt,
    lastMessage,
    lastError, // (from updated WebSocketContext)
    startRecording, // sends {type:"cmd", action:"start"}
    stopRecording, // sends {type:"cmd", action:"stop"}
    disconnect,
  } = useWebSocket();

  const [chartData, setChartData] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [sessionSamples, setSessionSamples] = useState([]);
  const [durationSec, setDurationSec] = useState(0);

  // UI/logic refs
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const prevRepCount = useRef(0);
  const wasRecordingRef = useRef(false);

  // prevent double-taps while waiting for server flips
  const startPendingRef = useRef(false);
  const stopPendingRef = useRef(false);

  // If you want to only end workout when user pressed Stop (not if server stops for other reasons)
  const userStopRequestedRef = useRef(false);

  const isConnected = connectionStatus === 'connected';
  const isReconnecting = connectionStatus === 'disconnected' && wasRecordingRef.current;

  // --- Toast (simple inline, no dependency) ---
  const [toast, setToast] = useState(null); // { text, kind }
  const toastTimerRef = useRef(null);

  const showToast = (text, kind = 'info', ms = 1600) => {
    setToast({ text, kind });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), ms);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // --- Show server error toast (debounced in WebSocketContext) ---
  useEffect(() => {
    if (!lastError) return;
    showToast(`⚠️ Server: ${lastError.msg}`, 'warn', 2200);
  }, [lastError]);

  // --- Update duration every 1s while recording ---
  useEffect(() => {
    if (!isRecording || !startTime) return;

    setDurationSec(Math.floor((Date.now() - startTime) / 1000));

    const id = setInterval(() => {
      setDurationSec(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(id);
  }, [isRecording, startTime]);

  // --- Handle ACK toasts (do NOT set recording here) ---
  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === 'ack') {
      const action = lastMessage.action;
      if (action === 'start') showToast('✅ Start acknowledged by server', 'success');
      else if (action === 'stop') showToast('🛑 Stop acknowledged by server', 'info');
      else if (action === 'reset') showToast('🔄 Reset acknowledged by server', 'info');
      else showToast('✅ Server ACK', 'info');
    }
  }, [lastMessage]);

  // --- Recording state transitions (server truth) ---
  useEffect(() => {
    const wasRecording = wasRecordingRef.current;

    // started (server recording:true)
    if (isRecording && !wasRecording) {
      setStartTime(Date.now());
      setDurationSec(0);
      setSessionSamples([]);
      setChartData([]);
      prevRepCount.current = 0;

      startPendingRef.current = false;
      stopPendingRef.current = false;
      userStopRequestedRef.current = false;

      console.log('🎬 Recording started (server truth)');
    }

    // stopped (server recording:false)
    if (!isRecording && wasRecording) {
      console.log('⏹️ Recording stopped (server truth)');
      startPendingRef.current = false;
      stopPendingRef.current = false;

      const dur = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
      setDurationSec(dur);

      // Only end workout if the USER requested stop
      // (prevents accidental auto-end if server stops due to error/disconnect)
      if (userStopRequestedRef.current) {
        userStopRequestedRef.current = false;
        onEndWorkout({
          reps: repCount,
          duration: dur,
          samples: sessionSamples,
          startTime,
          endTime: Date.now(),
          avgVelocity: 0.28,
          exercise: 'Squat',
          weight: 135,
        });
      } else {
        // optional: if it stopped unexpectedly, show a toast
        showToast('⚠️ Recording stopped by server', 'warn', 2200);
      }
    }

    wasRecordingRef.current = isRecording;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  // --- Chart updates + sample capture + rep pulse ---
  useEffect(() => {
    if (!lastMessage) return;

    // Chart preview even when not recording
    if (lastMessage.gyro_filt !== undefined) {
      setChartData((prev) => {
        const updated = [...prev, lastMessage.gyro_filt];
        return updated.slice(-100);
      });
    }

    // Save samples only while recording
    if (isRecording && lastMessage.type === 'rep_update') {
      setSessionSamples((prev) => [
        ...prev,
        {
          ...lastMessage,
          timestamp: Date.now(),
        },
      ]);
    }

    // Pulse on rep increase
    if (repCount > prevRepCount.current) {
      triggerPulse();
      prevRepCount.current = repCount;
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

  // --- Buttons: send cmd, then wait for server recording flip ---
  const handleStartWorkout = () => {
    if (!isConnected) return;
    if (isRecording || startPendingRef.current) return;

    startPendingRef.current = true;
    showToast('⏳ Starting… waiting for server', 'info');
    startRecording();

    setTimeout(() => {
      if (startPendingRef.current && !isRecording) {
        startPendingRef.current = false;
        showToast('⚠️ Start not confirmed yet. Check logs/server.', 'warn', 2200);
      }
    }, 2500);
  };

  const handleStopWorkout = () => {
    if (!isConnected) return;
    if (!isRecording || stopPendingRef.current) return;

    userStopRequestedRef.current = true;
    stopPendingRef.current = true;

    showToast('⏳ Stopping… waiting for server', 'info');
    stopRecording();

    setTimeout(() => {
      if (stopPendingRef.current && isRecording) {
        stopPendingRef.current = false;
        userStopRequestedRef.current = false;
        showToast('⚠️ Stop not confirmed yet. Check logs/server.', 'warn', 2200);
      }
    }, 2500);
  };

  const handleDisconnect = () => {
    disconnect();
    onDisconnect();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Toast */}
      {toast && (
        <View
          style={[
            styles.toast,
            toast.kind === 'success'
              ? styles.toastSuccess
              : toast.kind === 'warn'
              ? styles.toastWarn
              : styles.toastInfo,
          ]}
        >
          <Text style={styles.toastText}>{toast.text}</Text>
        </View>
      )}

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButtonContainer}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Live Workout</Text>
          <View style={styles.statusContainer}>
            <View
              style={[
                styles.statusDot,
                isConnected ? styles.statusConnected : styles.statusDisconnected,
              ]}
            />
            <Text style={styles.statusText}>
              {isReconnecting
                ? 'Reconnecting...'
                : isConnected
                ? `Connected • ${currentState}`
                : 'Disconnected'}
            </Text>
          </View>
        </View>

        <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectButton}>
          <Text style={styles.disconnectText}>⋮</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Rep Counter */}
        <View style={[styles.repCounterWrapper, !isRecording && styles.repCounterPaused]}>
          <RepCounter count={repCount} pulseAnim={pulseAnim} />
          {!isRecording && repCount === 0 && (
            <Text style={styles.pausedText}>Press Start to begin counting</Text>
          )}
          {!isRecording && repCount > 0 && (
            <Text style={styles.frozenText}>🔒 Session Ended</Text>
          )}
        </View>

        {/* Recording Badge */}
        {isRecording && (
          <View style={styles.recordingBadge}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>RECORDING</Text>
          </View>
        )}

        {/* Motion State */}
        <View style={styles.stateCard}>
          <Text style={styles.stateLabel}>Motion Status</Text>
          <Text
            style={[
              styles.stateValue,
              currentState === 'MOVING'
                ? styles.stateMoving
                : currentState === 'CALIBRATING'
                ? styles.stateCalibrating
                : styles.stateWaiting,
            ]}
          >
            {currentState === 'WAITING' && '⏸️ Ready'}
            {currentState === 'MOVING' && '🏋️ Moving'}
            {currentState === 'CALIBRATING' && '🔄 Calibrating'}
          </Text>
          <Text style={styles.stateNote}>{isRecording ? 'Reps counting' : 'Reps paused'}</Text>
        </View>

        {/* Live Chart */}
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>
            Filtered Gyro Signal {!isRecording && '(Live Preview)'}
          </Text>
          <LiveChart data={chartData} />
          <Text style={styles.chartNote}>Current: {Number(gyroFilt).toFixed(2)}</Text>
        </View>

        {/* Duration */}
        {isRecording && startTime && (
          <View style={styles.timeCard}>
            <Text style={styles.timeLabel}>Session Duration</Text>
            <Text style={styles.timeValue}>{durationSec}s</Text>
          </View>
        )}

        {/* Server Status */}
        {lastMessage && (
          <View style={styles.serverStatusCard}>
            <Text style={styles.serverStatusTitle}>Server Status</Text>
            <View style={styles.serverStatusGrid}>
              <View style={styles.serverStatusItem}>
                <Text style={styles.serverStatusLabel}>Recording:</Text>
                <Text
                  style={[
                    styles.serverStatusValue,
                    isRecording ? styles.valueActive : styles.valueInactive,
                  ]}
                >
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
                <Text style={styles.serverStatusValue}>{Number(gyroFilt).toFixed(1)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Reconnection Warning */}
        {isReconnecting && (
          <View style={styles.reconnectCard}>
            <Text style={styles.reconnectIcon}>🔄</Text>
            <Text style={styles.reconnectText}>
              Connection lost. Attempting to reconnect...
            </Text>
            <Text style={styles.reconnectSubtext}>Your session data is preserved</Text>
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
            style={[
              styles.startButton,
              (!isConnected || startPendingRef.current) && styles.buttonDisabled,
            ]}
            onPress={handleStartWorkout}
            disabled={!isConnected || startPendingRef.current}
          >
            <Text style={styles.startButtonText}>
              {startPendingRef.current
                ? 'Starting...'
                : repCount > 0
                ? 'Start New Session'
                : 'Start Workout'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.stopButton, stopPendingRef.current && styles.buttonDisabled]}
            onPress={handleStopWorkout}
            disabled={stopPendingRef.current}
          >
            <Text style={styles.stopButtonText}>
              {stopPendingRef.current ? 'Stopping...' : 'Stop Workout'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },

  toast: {
    position: 'absolute',
    top: 52,
    left: 16,
    right: 16,
    zIndex: 999,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  toastText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  toastInfo: { backgroundColor: '#1a2a3a', borderColor: '#2e4a66' },
  toastSuccess: { backgroundColor: '#16301b', borderColor: '#2b7a3a' },
  toastWarn: { backgroundColor: '#3a2a1a', borderColor: '#7a5a2b' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  backButtonContainer: { padding: 8, marginRight: 12 },
  backButtonText: { fontSize: 28, color: '#fff' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  statusContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusConnected: { backgroundColor: '#4CAF50' },
  statusDisconnected: { backgroundColor: '#ff4444' },
  statusText: { fontSize: 12, color: '#888' },
  disconnectButton: { padding: 8 },
  disconnectText: { fontSize: 24, color: '#888' },

  scrollContent: { padding: 20 },
  repCounterWrapper: { marginBottom: 20 },
  repCounterPaused: { opacity: 0.6 },
  pausedText: { textAlign: 'center', color: '#888', fontSize: 14, marginTop: 8 },
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
  stateLabel: { fontSize: 14, color: '#888', marginBottom: 8 },
  stateValue: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  stateWaiting: { color: '#FFC107' },
  stateMoving: { color: '#4CAF50' },
  stateCalibrating: { color: '#2196F3' },
  stateNote: { fontSize: 12, color: '#666', marginTop: 8 },

  chartContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  chartTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  chartNote: { fontSize: 12, color: '#888', marginTop: 8, textAlign: 'center' },

  timeCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  timeLabel: { fontSize: 14, color: '#888', marginBottom: 4 },
  timeValue: { fontSize: 32, fontWeight: 'bold', color: '#2196F3' },

  serverStatusCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  serverStatusTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  serverStatusGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  serverStatusItem: { width: '50%', marginBottom: 12 },
  serverStatusLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  serverStatusValue: { fontSize: 16, color: '#4CAF50', fontWeight: 'bold' },
  valueActive: { color: '#ff4444' },
  valueInactive: { color: '#666' },

  reconnectCard: {
    backgroundColor: '#1a2a3a',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  reconnectIcon: { fontSize: 48, marginBottom: 12 },
  reconnectText: { fontSize: 16, color: '#2196F3', textAlign: 'center', marginBottom: 8 },
  reconnectSubtext: { fontSize: 13, color: '#888', textAlign: 'center' },

  notConnectedCard: {
    backgroundColor: '#3a1a1a',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  notConnectedIcon: { fontSize: 48, marginBottom: 16 },
  notConnectedText: { fontSize: 16, color: '#ff4444', textAlign: 'center' },

  footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#222' },
  startButton: { backgroundColor: '#4CAF50', borderRadius: 12, padding: 18, alignItems: 'center' },
  stopButton: { backgroundColor: '#ff4444', borderRadius: 12, padding: 18, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#333' },

  startButtonText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  stopButtonText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
});
