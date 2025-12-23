import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, StatusBar } from 'react-native';

export default function HistoryScreen({ history, onBack, onSelectSession }) {
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Workout History</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Summary Stats */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{history.length}</Text>
            <Text style={styles.summaryLabel}>Total Sessions</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {Math.floor(history.reduce((sum, h) => sum + h.reps, 0) / history.length)}
            </Text>
            <Text style={styles.summaryLabel}>Avg Reps</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {(history.reduce((sum, h) => sum + h.avgVelocity, 0) / history.length).toFixed(2)}
            </Text>
            <Text style={styles.summaryLabel}>Avg Velocity</Text>
          </View>
        </View>

        {/* History List */}
        <Text style={styles.listTitle}>Recent Workouts</Text>
        
        {history.map((session) => (
          <TouchableOpacity
            key={session.id}
            style={styles.sessionCard}
            onPress={() => onSelectSession(session)}
          >
            <View style={styles.sessionHeader}>
              <View>
                <Text style={styles.sessionExercise}>{session.exercise}</Text>
                <Text style={styles.sessionDate}>{formatDate(session.timestamp)}</Text>
              </View>
              <View style={styles.sessionBadge}>
                <Text style={styles.sessionWeight}>{session.weight} lbs</Text>
              </View>
            </View>

            <View style={styles.sessionStats}>
              <View style={styles.sessionStat}>
                <Text style={styles.statValue}>{session.reps}</Text>
                <Text style={styles.statLabel}>REPS</Text>
              </View>
              <View style={styles.sessionDivider} />
              <View style={styles.sessionStat}>
                <Text style={styles.statValue}>{session.avgVelocity.toFixed(2)} m/s</Text>
                <Text style={styles.statLabel}>AVG VELOCITY</Text>
              </View>
            </View>

            <View style={styles.sessionFooter}>
              <Text style={styles.sessionTime}>{formatTime(session.timestamp)}</Text>
              <Text style={styles.viewDetails}>View Details →</Text>
            </View>
          </TouchableOpacity>
        ))}

        {history.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🏋️</Text>
            <Text style={styles.emptyText}>No workouts yet</Text>
            <Text style={styles.emptySubtext}>Start your first session to see history</Text>
          </View>
        )}
      </ScrollView>
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
  backButton: {
    fontSize: 28,
    color: '#fff',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  scrollContent: {
    padding: 20,
  },
  summaryCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    marginBottom: 24,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#333',
  },
  listTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  sessionCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sessionExercise: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  sessionDate: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  sessionBadge: {
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sessionWeight: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  sessionStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#222',
  },
  sessionStat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
    letterSpacing: 1,
  },
  sessionDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#333',
  },
  sessionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  sessionTime: {
    fontSize: 12,
    color: '#666',
  },
  viewDetails: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
  },
});