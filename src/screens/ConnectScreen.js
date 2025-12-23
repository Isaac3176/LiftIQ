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
  ScrollView
} from 'react-native';
import { connectWebSocket } from '../utils/websocket';
import ConnectionStatus from '../components/ConnectionStatus';

export default function ConnectScreen({ onConnect }) {
  const [ipAddress, setIpAddress] = useState('192.168.1.100');
  const [port, setPort] = useState('8765');
  const [status, setStatus] = useState('disconnected');
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = () => {
    Keyboard.dismiss(); // Close keyboard when connecting
    
    if (!ipAddress.trim()) {
      setError('Please enter an IP address');
      return;
    }

    setIsConnecting(true);
    setError('');
    setStatus('connecting');

    connectWebSocket(
      ipAddress,
      port,
      (ws) => {
        setIsConnecting(false);
        setStatus('connected');
        setTimeout(() => onConnect(ws), 500);
      },
      (errorMsg) => {
        setIsConnecting(false);
        setStatus('error');
        setError(errorMsg);
      }
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Smart Weightlifting</Text>
            <Text style={styles.subtitle}>Connect to Raspberry Pi</Text>
          </View>

          <ConnectionStatus status={status} />

          <View style={styles.form}>
            <Text style={styles.label}>Raspberry Pi IP Address</Text>
            <TextInput
              style={styles.input}
              value={ipAddress}
              onChangeText={setIpAddress}
              placeholder="192.168.1.100"
              placeholderTextColor="#666"
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
              placeholderTextColor="#666"
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
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Connect</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.instructions}>
            <Text style={styles.instructionTitle}>Setup Instructions:</Text>
            <Text style={styles.instructionText}>
              1. Start the WebSocket server on your Raspberry Pi{'\n'}
              2. Ensure both devices are on the same Wi-Fi network{'\n'}
              3. Enter the Pi's IP address above{'\n'}
              4. Default port is 8765{'\n'}
              5. Tap Connect
            </Text>
          </View>

          <TouchableOpacity 
            style={styles.dismissButton}
            onPress={Keyboard.dismiss}
          >
            <Text style={styles.dismissButtonText}>Tap anywhere to close keyboard</Text>
          </TouchableOpacity>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
  },
  form: {
    marginBottom: 40,
  },
  label: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
  },
  errorContainer: {
    backgroundColor: '#ff4444',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    backgroundColor: '#666',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  instructions: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  instructionText: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 22,
  },
  dismissButton: {
    padding: 20,
    alignItems: 'center',
  },
  dismissButtonText: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
  },
});