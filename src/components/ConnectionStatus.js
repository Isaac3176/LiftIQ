import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ConnectionStatus({ status }) {
  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return '#4CAF50';
      case 'connecting':
        return '#FFC107';
      case 'error':
        return '#ff4444';
      default:
        return '#666';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Connection Failed';
      default:
        return 'Disconnected';
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.indicator, { backgroundColor: getStatusColor() }]} />
      <Text style={styles.text}>{getStatusText()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  indicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

