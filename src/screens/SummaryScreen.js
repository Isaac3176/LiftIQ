import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { theme } from '../theme/performanceLabTheme';

export default function SummaryScreen({ sessionData, onNewWorkout, onDisconnect }) {
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleExport = async () => {
    try {
      const filename = `workout_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`;
      const filepath = `${FileSystem.documentDirectory}${filename}`;
      
      const exportData = {
        summary: {
          reps: sessionData.reps,
          duration: sessionData.duration,
          startTime: new Date(sessionData.startTime).toISOString(),
          endTime: new Date(sessionData.endTime).toISOString(),
        },
        samples: sessionData.samples,
      };

      await FileSystem.writeAsStringAsync(
        filepath,
        JSON.stringify(exportData, null, 2)
      );

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filepath);
      } else {
        Alert.alert('Export Successful', `Data saved to: ${filename}`);
      }
    } catch (error) {
      Alert.alert('Export Failed', error.message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Workout Complete!</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{sessionData.reps}</Text>
          <Text style={styles.statLabel}>Total Reps</Text>
        </View>

        <View style={styles.statBox}>
          <Text style={styles.statValue}>{formatDuration(sessionData.duration)}</Text>
          <Text style={styles.statLabel}>Duration</Text>
        </View>

        <View style={styles.statBox}>
          <Text style={styles.statValue}>{sessionData.samples.length}</Text>
          <Text style={styles.statLabel}>Data Points</Text>
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.exportButton} onPress={handleExport}>
          <Text style={styles.exportButtonText}>Export Session Data</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.newWorkoutButton} onPress={onNewWorkout}>
          <Text style={styles.newWorkoutButtonText}>Start New Workout</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.disconnectButton} onPress={onDisconnect}>
          <Text style={styles.disconnectButtonText}>Disconnect</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.accent,
  },
  statsContainer: {
    marginBottom: 40,
  },
  statBox: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  statValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  buttonContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  exportButton: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  exportButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  newWorkoutButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  newWorkoutButtonText: {
    color: theme.colors.onAccent,
    fontSize: 18,
    fontWeight: 'bold',
  },
  disconnectButton: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  disconnectButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
  },
});

