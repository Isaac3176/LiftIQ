import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

export default function RepCounter({ count, pulseAnim }) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Reps</Text>
      <Animated.Text 
        style={[
          styles.count,
          {
            transform: [{ scale: pulseAnim }]
          }
        ]}
      >
        {count}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  label: {
    fontSize: 20,
    color: '#888',
    marginBottom: 8,
  },
  count: {
    fontSize: 80,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
});