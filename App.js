import React, { useState } from 'react';
import { StyleSheet, View, StatusBar } from 'react-native';
import ConnectScreen from './src/screens/ConnectScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import WorkoutScreen from './src/screens/WorkoutScreen';
import SessionSummaryScreen from './src/screens/SessionSummaryScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import SettingsScreen from './src/screens/SettingsScreen';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('connect');
  const [websocket, setWebsocket] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [workoutHistory, setWorkoutHistory] = useState([
    // Placeholder history
    {
      id: 1,
      date: 'Today',
      reps: 10,
      avgVelocity: 0.28,
      exercise: 'Squat',
      weight: 135,
      timestamp: Date.now() - 3600000
    },
    {
      id: 2,
      date: 'Yesterday',
      reps: 7,
      avgVelocity: 0.24,
      exercise: 'Bench Press',
      weight: 185,
      timestamp: Date.now() - 86400000
    },
    {
      id: 3,
      date: 'Yesterday',
      reps: 8,
      avgVelocity: 0.21,
      exercise: 'Deadlift',
      weight: 225,
      timestamp: Date.now() - 90000000
    },
    {
      id: 4,
      date: 'Mon, Jan 29',
      reps: 8,
      avgVelocity: 0.22,
      exercise: 'Squat',
      weight: 135,
      timestamp: Date.now() - 172800000
    }
  ]);

  const handleConnect = (ws) => {
    setWebsocket(ws);
    setCurrentScreen('dashboard');
  };

  const handleDisconnect = () => {
    if (websocket) {
      websocket.close();
    }
    setWebsocket(null);
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
      avgVelocity: Math.random() * 0.3 + 0.15,
      exercise: 'Squat',
      weight: 135,
      timestamp: Date.now(),
      ...data
    };
    
    setWorkoutHistory([newSession, ...workoutHistory]);
    setSessionData(newSession);
    setCurrentScreen('sessionSummary');
  };

  const navigateTo = (screen) => {
    setCurrentScreen(screen);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      
      {currentScreen === 'connect' && (
        <ConnectScreen onConnect={handleConnect} />
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
          websocket={websocket} 
          onDisconnect={handleDisconnect}
          onEndWorkout={handleEndWorkout}
          onBack={() => navigateTo('dashboard')}
        />
      )}
      
      {currentScreen === 'sessionSummary' && (
        <SessionSummaryScreen 
          sessionData={sessionData}
          onViewHistory={() => navigateTo('history')}
          onBackToDashboard={() => navigateTo('dashboard')}
        />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingTop: StatusBar.currentHeight || 0,
  },
});