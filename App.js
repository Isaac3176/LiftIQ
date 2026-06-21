import React, { useState } from 'react';
import { StyleSheet, View, StatusBar } from 'react-native';
import { WebSocketProvider } from './src/context/WebSocketContext';
import { CalibrationProvider } from './src/context/CalibrationContext';
import { saveSessionToFile } from './src/utils/sessionStorage';
import { theme } from './src/theme/performanceLabTheme';
import ConnectScreen from './src/screens/ConnectScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import WorkoutScreen from './src/screens/WorkoutScreen';
import WorkoutCompleteScreen from './src/screens/WorkoutCompleteScreen';
import SessionSummaryScreen from './src/screens/SessionSummaryScreen';
import MotionReplayScreen from './src/screens/MotionReplayScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import SettingsScreen from './src/screens/SettingsScreen';

function AppContent() {
  const [currentScreen, setCurrentScreen] = useState('connect');
  const [sessionData, setSessionData] = useState(null);
  const [workoutHistory, setWorkoutHistory] = useState([]);

  const handleConnected = () => {
    setCurrentScreen('dashboard');
  };

  const handleDisconnect = () => {
    setCurrentScreen('connect');
  };

  const handleStartWorkout = () => {
    setCurrentScreen('workout');
  };

  const handleEndWorkout = (data) => {
    const newSession = {
      id: workoutHistory.length + 1,
      date: 'Today',
      reps: data.reps,
      avgVelocity: data.avgVelocity || 0.25,
      exercise: data.exercise || 'Squat',
      weight: data.weight || 135,
      timestamp: Date.now(),
      ...data
    };
    
    setWorkoutHistory([newSession, ...workoutHistory]);
    setSessionData(newSession);
    setCurrentScreen('workoutComplete');

    saveSessionToFile(newSession, newSession?.set?.e1rm || null)
      .then((localLogUri) => {
        setWorkoutHistory((prev) =>
          prev.map((entry) => (entry.id === newSession.id ? { ...entry, localLogUri } : entry))
        );
        setSessionData((prev) => (prev?.id === newSession.id ? { ...prev, localLogUri } : prev));
      })
      .catch((error) => {
        console.error('Failed to save local session log:', error);
      });
  };

  const handleFinishAnimationComplete = () => {
    setCurrentScreen('sessionSummary');
  };

  const navigateTo = (screen) => {
    setCurrentScreen(screen);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.bg} />
      
      {currentScreen === 'connect' && (
        <ConnectScreen onConnected={handleConnected} />
      )}
      
      {currentScreen === 'dashboard' && (
        <DashboardScreen 
          onStartWorkout={handleStartWorkout}
          onNavigate={navigateTo}
          onDisconnect={handleDisconnect}
          recentSession={workoutHistory[0]}
        />
      )}
      
      {currentScreen === 'workout' && (
        <WorkoutScreen 
          onDisconnect={handleDisconnect}
          onEndWorkout={handleEndWorkout}
          onBack={() => navigateTo('dashboard')}
        />
      )}
      
      {currentScreen === 'sessionSummary' && (
        <SessionSummaryScreen
          sessionData={sessionData}
          onViewHistory={() => navigateTo('history')}
          onViewMotion={() => navigateTo('motionReplay')}
          onBackToDashboard={() => navigateTo('dashboard')}
        />
      )}

      {currentScreen === 'motionReplay' && (
        <MotionReplayScreen
          sessionData={sessionData}
          onBack={() => navigateTo('sessionSummary')}
        />
      )}

      {currentScreen === 'workoutComplete' && (
        <WorkoutCompleteScreen onComplete={handleFinishAnimationComplete} />
      )}
      
      {currentScreen === 'history' && (
        <HistoryScreen 
          history={workoutHistory}
          onBack={() => navigateTo('dashboard')}
          onSelectSession={(session) => {
            setSessionData(session);
            navigateTo('sessionSummary');
          }}
        />
      )}
      
      {currentScreen === 'analytics' && (
        <AnalyticsScreen 
          history={workoutHistory}
          onBack={() => navigateTo('dashboard')}
        />
      )}
      
      {currentScreen === 'settings' && (
        <SettingsScreen 
          onBack={() => navigateTo('dashboard')}
        />
      )}
    </View>
  );
}

export default function App() {
  return (
    <CalibrationProvider>
      <WebSocketProvider>
        <AppContent />
      </WebSocketProvider>
    </CalibrationProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
});
