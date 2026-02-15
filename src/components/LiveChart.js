import React, { useEffect, useMemo, useRef } from 'react';
import { View, Dimensions, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Line, Polyline, Text as SvgText } from 'react-native-svg';
import { theme } from '../theme/performanceLabTheme';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 72;
const CHART_HEIGHT = 200;
const PADDING = 20;

export default function LiveChart({ data }) {
  const chartAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(chartAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => chartAnim.setValue(0));
  }, [data.length, chartAnim]);

  if (data.length === 0) {
    return (
      <View style={[styles.container, { height: CHART_HEIGHT }]}>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
          <SvgText
            x={CHART_WIDTH / 2}
            y={CHART_HEIGHT / 2}
            fontSize="16"
            fill={theme.colors.textMuted}
            textAnchor="middle"
          >
            Waiting for data...
          </SvgText>
        </Svg>
      </View>
    );
  }

  const minValue = Math.min(...data, 0);
  const maxValue = Math.max(...data, 15);
  const range = maxValue - minValue || 1;

  const smoothData = useMemo(() => {
    if (data.length <= 2) return data;
    return data.map((value, index) => {
      const previous = data[index - 1] ?? value;
      const next = data[index + 1] ?? value;
      return (previous + value + next) / 3;
    });
  }, [data]);

  const denominator = Math.max(1, smoothData.length - 1);
  const points = smoothData.map((value, index) => {
    const x = PADDING + (index / denominator) * (CHART_WIDTH - 2 * PADDING);
    const y = CHART_HEIGHT - PADDING - ((value - minValue) / range) * (CHART_HEIGHT - 2 * PADDING);
    return `${x},${y}`;
  }).join(' ');

  const pulseStyle = {
    opacity: chartAnim.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }),
    transform: [{ scaleY: chartAnim.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }],
  };

  return (
    <Animated.View style={[styles.container, pulseStyle]}>
      <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
        {/* Faint grid */}
        <Line
          x1={PADDING}
          y1={PADDING + 28}
          x2={CHART_WIDTH - PADDING}
          y2={PADDING + 28}
          stroke={theme.colors.border}
          strokeOpacity={0.35}
          strokeWidth="1"
        />
        <Line
          x1={PADDING}
          y1={CHART_HEIGHT / 2}
          x2={CHART_WIDTH - PADDING}
          y2={CHART_HEIGHT / 2}
          stroke={theme.colors.border}
          strokeOpacity={0.3}
          strokeWidth="1"
          strokeDasharray="5,5"
        />
        <Line
          x1={PADDING}
          y1={CHART_HEIGHT - PADDING - 28}
          x2={CHART_WIDTH - PADDING}
          y2={CHART_HEIGHT - PADDING - 28}
          stroke={theme.colors.border}
          strokeOpacity={0.35}
          strokeWidth="1"
        />

        {/* Axis lines */}
        <Line
          x1={PADDING}
          y1={PADDING}
          x2={PADDING}
          y2={CHART_HEIGHT - PADDING}
          stroke={theme.colors.border}
          strokeWidth="1"
        />
        <Line
          x1={PADDING}
          y1={CHART_HEIGHT - PADDING}
          x2={CHART_WIDTH - PADDING}
          y2={CHART_HEIGHT - PADDING}
          stroke={theme.colors.border}
          strokeWidth="1"
        />

        {/* Data line */}
        {smoothData.length > 1 && (
          <>
            <Polyline
              points={points}
              fill="none"
              stroke={theme.colors.accentStrong}
              strokeWidth="6"
            />
            <Polyline
              points={points}
              fill="none"
              stroke={theme.colors.accent}
              strokeWidth="2"
            />
          </>
        )}

        {/* Labels */}
        <SvgText
          x={PADDING - 5}
          y={PADDING}
          fontSize="10"
          fill={theme.colors.textMuted}
          textAnchor="end"
        >
          {maxValue.toFixed(1)}
        </SvgText>
        <SvgText
          x={PADDING - 5}
          y={CHART_HEIGHT - PADDING}
          fontSize="10"
          fill={theme.colors.textMuted}
          textAnchor="end"
        >
          {minValue.toFixed(1)}
        </SvgText>
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
});

