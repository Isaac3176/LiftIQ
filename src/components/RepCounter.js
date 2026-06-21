import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { theme } from '../theme/performanceLabTheme';

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
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  label: {
    fontSize: 20,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  count: {
    fontSize: 80,
    fontWeight: 'bold',
    color: theme.colors.accent,
  },
});
