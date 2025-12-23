import React from 'react';
import { View, Dimensions, StyleSheet } from 'react-native';
import Svg, { Line, Polyline, Text as SvgText } from 'react-native-svg';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 72;
const CHART_HEIGHT = 200;
const PADDING = 20;

export default function LiveChart({ data }) {
  if (data.length === 0) {
    return (
      <View style={[styles.container, { height: CHART_HEIGHT }]}>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
          <SvgText
            x={CHART_WIDTH / 2}
            y={CHART_HEIGHT / 2}
            fontSize="16"
            fill="#666"
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
  const range = maxValue - minValue;

  const points = data.map((value, index) => {
    const x = PADDING + (index / (data.length - 1)) * (CHART_WIDTH - 2 * PADDING);
    const y = CHART_HEIGHT - PADDING - ((value - minValue) / range) * (CHART_HEIGHT - 2 * PADDING);
    return `${x},${y}`;
  }).join(' ');

  return (
    <View style={styles.container}>
      <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
        {/* Grid lines */}
        <Line
          x1={PADDING}
          y1={PADDING}
          x2={PADDING}
          y2={CHART_HEIGHT - PADDING}
          stroke="#333"
          strokeWidth="1"
        />
        <Line
          x1={PADDING}
          y1={CHART_HEIGHT - PADDING}
          x2={CHART_WIDTH - PADDING}
          y2={CHART_HEIGHT - PADDING}
          stroke="#333"
          strokeWidth="1"
        />

        {/* Middle reference line */}
        <Line
          x1={PADDING}
          y1={CHART_HEIGHT / 2}
          x2={CHART_WIDTH - PADDING}
          y2={CHART_HEIGHT / 2}
          stroke="#222"
          strokeWidth="1"
          strokeDasharray="5,5"
        />

        {/* Data line */}
        {data.length > 1 && (
          <Polyline
            points={points}
            fill="none"
            stroke="#4CAF50"
            strokeWidth="2"
          />
        )}

        {/* Labels */}
        <SvgText
          x={PADDING - 5}
          y={PADDING}
          fontSize="10"
          fill="#666"
          textAnchor="end"
        >
          {maxValue.toFixed(1)}
        </SvgText>
        <SvgText
          x={PADDING - 5}
          y={CHART_HEIGHT - PADDING}
          fontSize="10"
          fill="#666"
          textAnchor="end"
        >
          {minValue.toFixed(1)}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
});

