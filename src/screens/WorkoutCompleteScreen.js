import React, { useEffect, useRef } from 'react';
import { Animated, Easing, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme/performanceLabTheme';

const DISPLAY_MS = 1900;

export default function WorkoutCompleteScreen({ onComplete }) {
  const topBand = useRef(new Animated.Value(-80)).current;
  const bottomBand = useRef(new Animated.Value(80)).current;
  const iconRise = useRef(new Animated.Value(18)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const titleRise = useRef(new Animated.Value(20)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const subOpacity = useRef(new Animated.Value(0)).current;
  const dumbbellFloat = useRef(new Animated.Value(0)).current;
  const sparkA = useRef(new Animated.Value(0)).current;
  const sparkB = useRef(new Animated.Value(0)).current;
  const sparkC = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const inAnim = Animated.parallel([
      Animated.timing(topBand, {
        toValue: 0,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(bottomBand, {
        toValue: 0,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(220),
        Animated.parallel([
          Animated.timing(iconRise, {
            toValue: 0,
            duration: 420,
            easing: Easing.out(Easing.back(1.2)),
            useNativeDriver: true,
          }),
          Animated.timing(iconOpacity, {
            toValue: 1,
            duration: 360,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.sequence([
        Animated.delay(340),
        Animated.parallel([
          Animated.timing(titleRise, {
            toValue: 0,
            duration: 420,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(titleOpacity, {
            toValue: 1,
            duration: 330,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(subOpacity, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]);

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(dumbbellFloat, {
          toValue: -6,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(dumbbellFloat, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const spark = (v, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, {
            toValue: 1,
            duration: 1000,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 1,
            useNativeDriver: true,
          }),
        ])
      );

    inAnim.start();
    floatLoop.start();
    const sparkLoopA = spark(sparkA, 0);
    const sparkLoopB = spark(sparkB, 220);
    const sparkLoopC = spark(sparkC, 420);
    sparkLoopA.start();
    sparkLoopB.start();
    sparkLoopC.start();

    const timeoutId = setTimeout(() => {
      onComplete?.();
    }, DISPLAY_MS);

    return () => {
      clearTimeout(timeoutId);
      floatLoop.stop();
      sparkLoopA.stop();
      sparkLoopB.stop();
      sparkLoopC.stop();
    };
  }, [bottomBand, dumbbellFloat, iconOpacity, iconRise, onComplete, sparkA, sparkB, sparkC, subOpacity, titleOpacity, titleRise, topBand]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <Animated.View style={[styles.band, styles.topBand, { transform: [{ rotate: '-28deg' }, { translateY: topBand }] }]} />
      <Animated.View style={[styles.band, styles.bottomBand, { transform: [{ rotate: '-28deg' }, { translateY: bottomBand }] }]} />

      <View style={styles.centerContent}>
        <Animated.View
          style={[
            styles.dumbbellWrap,
            {
              opacity: iconOpacity,
              transform: [{ translateY: Animated.add(iconRise, dumbbellFloat) }],
            },
          ]}
        >
          <DumbbellIcon />
        </Animated.View>

        <Animated.Text style={[styles.title, { opacity: titleOpacity, transform: [{ translateY: titleRise }] }]}>
          Nice lift!
        </Animated.Text>
        <Animated.Text style={[styles.subtitle, { opacity: subOpacity }]}>Set locked in</Animated.Text>
      </View>

      <Spark
        value={sparkA}
        style={styles.sparkA}
        xOutput={[0, -12]}
        yOutput={[0, -30]}
        scaleOutput={[0.3, 1]}
      />
      <Spark
        value={sparkB}
        style={styles.sparkB}
        xOutput={[0, 10]}
        yOutput={[0, -34]}
        scaleOutput={[0.3, 0.9]}
      />
      <Spark
        value={sparkC}
        style={styles.sparkC}
        xOutput={[0, 6]}
        yOutput={[0, -26]}
        scaleOutput={[0.3, 0.8]}
      />
    </SafeAreaView>
  );
}

function DumbbellIcon() {
  return (
    <View style={styles.dumbbell}>
      <View style={styles.plateOuter} />
      <View style={styles.plateInner} />
      <View style={styles.bar} />
      <View style={styles.plateInner} />
      <View style={styles.plateOuter} />
    </View>
  );
}

function Spark({ value, style, xOutput, yOutput, scaleOutput }) {
  const opacity = value.interpolate({
    inputRange: [0, 0.15, 0.8, 1],
    outputRange: [0, 1, 0.65, 0],
  });
  const translateX = value.interpolate({
    inputRange: [0, 1],
    outputRange: xOutput,
  });
  const translateY = value.interpolate({
    inputRange: [0, 1],
    outputRange: yOutput,
  });
  const scale = value.interpolate({
    inputRange: [0, 1],
    outputRange: scaleOutput,
  });

  return <Animated.View style={[styles.spark, style, { opacity, transform: [{ translateX }, { translateY }, { scale }] }]} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  band: {
    position: 'absolute',
    width: 560,
    height: 560,
    borderRadius: 280,
    borderWidth: 44,
    borderColor: 'rgba(0, 245, 255, 0.58)',
  },
  topBand: {
    top: -360,
    right: -160,
  },
  bottomBand: {
    bottom: -360,
    left: -150,
  },
  centerContent: {
    alignItems: 'center',
    zIndex: 2,
  },
  dumbbellWrap: {
    marginBottom: 18,
  },
  dumbbell: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  plateOuter: {
    width: 9,
    height: 30,
    borderRadius: 3,
    backgroundColor: theme.colors.textPrimary,
  },
  plateInner: {
    width: 7,
    height: 24,
    borderRadius: 3,
    backgroundColor: theme.colors.textSecondary,
    marginHorizontal: 3,
  },
  bar: {
    width: 28,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.textPrimary,
  },
  title: {
    fontSize: 44,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: theme.colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  spark: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
    zIndex: 1,
  },
  sparkA: {
    top: '42%',
    left: '45%',
  },
  sparkB: {
    top: '43%',
    left: '55%',
  },
  sparkC: {
    top: '45%',
    left: '50%',
  },
});
