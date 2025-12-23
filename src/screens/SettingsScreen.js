import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, SafeAreaView, StatusBar } from 'react-native';

export default function SettingsScreen({ onBack }) {
  const [autoDetect, setAutoDetect] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibration, setVibration] = useState(true);
  const [coaching, setCoaching] = useState(true);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Detection Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎯 Rep Detection</Text>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Auto-detect Exercise</Text>
              <Text style={styles.settingDesc}>Automatically identify lift type</Text>
            </View>
            <Switch
              value={autoDetect}
              onValueChange={setAutoDetect}
              trackColor={{ false: '#333', true: '#4CAF50' }}
              thumbColor={autoDetect ? '#fff' : '#888'}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Peak Threshold</Text>
              <Text style={styles.settingDesc}>12.0 m/s² (Default)</Text>
            </View>
            <TouchableOpacity style={styles.editButton}>
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Valley Threshold</Text>
              <Text style={styles.settingDesc}>9.5 m/s² (Default)</Text>
            </View>
            <TouchableOpacity style={styles.editButton}>
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Feedback Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔔 Feedback</Text>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Sound Effects</Text>
              <Text style={styles.settingDesc}>Rep count audio feedback</Text>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              trackColor={{ false: '#333', true: '#4CAF50' }}
              thumbColor={soundEnabled ? '#fff' : '#888'}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Vibration</Text>
              <Text style={styles.settingDesc}>Haptic feedback on reps</Text>
            </View>
            <Switch
              value={vibration}
              onValueChange={setVibration}
              trackColor={{ false: '#333', true: '#4CAF50' }}
              thumbColor={vibration ? '#fff' : '#888'}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>AI Coaching Cues</Text>
              <Text style={styles.settingDesc}>Real-time form feedback</Text>
            </View>
            <Switch
              value={coaching}
              onValueChange={setCoaching}
              trackColor={{ false: '#333', true: '#4CAF50' }}
              thumbColor={coaching ? '#fff' : '#888'}
            />
          </View>
        </View>

        {/* Connection Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📡 Connection</Text>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Raspberry Pi IP</Text>
              <Text style={styles.settingDesc}>172.20.19.98:8765</Text>
            </View>
            <TouchableOpacity style={styles.editButton}>
              <Text style={styles.editButtonText}>Change</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Reconnect on Disconnect</Text>
              <Text style={styles.settingDesc}>Auto-reconnect if connection drops</Text>
            </View>
            <Switch
              value={true}
              onValueChange={() => {}}
              trackColor={{ false: '#333', true: '#4CAF50' }}
              thumbColor={'#fff'}
            />
          </View>
        </View>

        {/* Data Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💾 Data</Text>
          
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonText}>Export All Data</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonText}>Clear History</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, styles.dangerButton]}>
            <Text style={[styles.actionButtonText, styles.dangerText]}>Reset All Settings</Text>
          </TouchableOpacity>
        </View>

        {/* About */}
        <View style={styles.aboutSection}>
          <Text style={styles.aboutTitle}>LiftIQ</Text>
          <Text style={styles.aboutVersion}>Version 1.0.0</Text>
          <Text style={styles.aboutText}>
            AI-powered weightlifting tracker with velocity-based training
          </Text>
        </View>
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
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  settingDesc: {
    fontSize: 13,
    color: '#888',
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
  },
  editButtonText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  dangerButton: {
    backgroundColor: '#3a1a1a',
  },
  dangerText: {
    color: '#ff4444',
  },
  aboutSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  aboutTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  aboutVersion: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  aboutText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});