import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { connectWebSocket } from '../utils/websocket';
import { useWebSocket } from '../context/WebSocketContext';
import ConnectionStatus from '../components/ConnectionStatus';
import { theme } from '../theme/performanceLabTheme';

export default function ConnectScreen({ onConnected }) {
  const { connect, connectionStatus, setPiIp } = useWebSocket();
  const [ipAddress, setIpAddress] = useState('192.168.1.100');
  const [port, setPort] = useState('8765');
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = () => {
    Keyboard.dismiss();

    if (!ipAddress.trim()) {
      setError('Please enter an IP address');
      return;
    }

    setIsConnecting(true);
    setError('');

    connectWebSocket(
      ipAddress,
      port,
      (ws) => {
        setIsConnecting(false);
        setPiIp(ipAddress.trim());
        connect(ws, ipAddress.trim());
        setTimeout(() => onConnected(), 500);
      },
      (errorMsg) => {
        setIsConnecting(false);
        setError(errorMsg);
      }
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <Text style={styles.title}>LiftIQ</Text>
              <Text style={styles.subtitle}>Dark Performance Lab</Text>
            </View>

            <ConnectionStatus status={connectionStatus} />

            <View style={styles.form}>
              <Text style={styles.label}>Raspberry Pi IP Address</Text>
              <TextInput
                style={styles.input}
                value={ipAddress}
                onChangeText={setIpAddress}
                placeholder="10.83.5.191"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="numeric"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => Keyboard.dismiss()}
              />

              <Text style={styles.label}>Port</Text>
              <TextInput
                style={styles.input}
                value={port}
                onChangeText={setPort}
                placeholder="8765"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />

              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.button, isConnecting && styles.buttonDisabled]}
                onPress={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <ActivityIndicator color={theme.colors.onAccent} />
                ) : (
                  <Text style={styles.buttonText}>Connect</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.instructions}>
              <Text style={styles.instructionTitle}>Setup</Text>
              <Text style={styles.instructionText}>
                1. Start WebSocket server on the Raspberry Pi{'\n'}
                2. Confirm both devices are on the same Wi-Fi{'\n'}
                3. Enter the Pi IP and port{'\n'}
                4. Connect and begin your session
              </Text>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginTop: 46,
    marginBottom: 34,
  },
  title: {
    fontSize: 42,
    fontWeight: '800',
    color: theme.colors.accent,
    marginBottom: 4,
    letterSpacing: 0.4,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  form: {
    marginBottom: 28,
  },
  label: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 8,
    marginTop: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 93, 115, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 93, 115, 0.4)',
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    backgroundColor: '#2e4234',
  },
  buttonText: {
    color: theme.colors.onAccent,
    fontSize: 18,
    fontWeight: '800',
  },
  instructions: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 20,
    marginBottom: 18,
  },
  instructionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  instructionText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
});
