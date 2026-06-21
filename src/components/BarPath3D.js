import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { theme } from '../theme/performanceLabTheme';
import { fitPathToView, projectPath, velocityColor } from '../utils/barPath';

const MAX_RENDER_POINTS = 130; // keep SVG light enough to rotate smoothly
const ROTATE_STEP_DEG = 1.4;
const ROTATE_INTERVAL_MS = 45;

function decimate(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const step = points.length / maxPoints;
  const out = [];
  for (let i = 0; i < maxPoints; i += 1) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

/**
 * 3D bar-path viewer rendered with react-native-svg (no WebGL).
 *
 * Props:
 *  - points: reconstructed 3D path [{x,y,z,v}] in true (meters) coordinates
 *  - peakVelocity: set peak velocity for color scaling
 *  - width / height: viewport size
 *  - autoRotate: spin the camera around the vertical axis
 *  - angleDeg: optional controlled view angle (overrides auto-rotation)
 */
export default function BarPath3D({
  points,
  peakVelocity = 1,
  width = 320,
  height = 360,
  autoRotate = true,
  angleDeg,
}) {
  const [autoAngle, setAutoAngle] = useState(20);
  const frame = useRef(null);

  useEffect(() => {
    if (!autoRotate || angleDeg != null) return undefined;
    frame.current = setInterval(() => {
      setAutoAngle((a) => (a + ROTATE_STEP_DEG) % 360);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(frame.current);
  }, [autoRotate, angleDeg]);

  const angle = angleDeg != null ? angleDeg : autoAngle;

  const fitted = useMemo(() => {
    const decimated = decimate(points || [], MAX_RENDER_POINTS);
    return fitPathToView(decimated, { width, height });
  }, [points, width, height]);

  const projected = useMemo(
    () => projectPath(fitted.points, { angleDeg: angle, scale: fitted.scale, cx: fitted.cx, cy: fitted.cy }),
    [fitted, angle]
  );

  if (!projected.length) {
    return <View style={[styles.empty, { width, height }]} />;
  }

  const depths = projected.map((p) => p.depth);
  const depthMin = Math.min(...depths);
  const depthMax = Math.max(...depths);
  const depthSpan = depthMax - depthMin || 1;

  // Vertical reference line (ideal straight bar path) at the horizontal centroid.
  const refTop = projectIdeal(fitted, angle, 1);
  const refBottom = projectIdeal(fitted, angle, -1);

  const start = projected[0];
  const end = projected[projected.length - 1];

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height}>
        {/* floor cross-hair for depth grounding */}
        <Line
          x1={fitted.cx - fitted.scale * 0.16}
          y1={refBottom.sy}
          x2={fitted.cx + fitted.scale * 0.16}
          y2={refBottom.sy}
          stroke={theme.colors.border}
          strokeWidth={1}
        />
        {/* ideal vertical path */}
        <Line
          x1={refBottom.sx}
          y1={refBottom.sy}
          x2={refTop.sx}
          y2={refTop.sy}
          stroke={theme.colors.border}
          strokeWidth={1.5}
          strokeDasharray="4 6"
        />

        {/* actual path, segment-colored by velocity */}
        {projected.slice(0, -1).map((p, i) => {
          const q = projected[i + 1];
          const vMid = (p.v + q.v) / 2;
          const depthNorm = (p.depth - depthMin) / depthSpan; // 0 far .. 1 near
          return (
            <Line
              key={i}
              x1={p.sx}
              y1={p.sy}
              x2={q.sx}
              y2={q.sy}
              stroke={velocityColor(vMid, peakVelocity)}
              strokeWidth={2 + depthNorm * 2.4}
              strokeLinecap="round"
              opacity={0.45 + depthNorm * 0.55}
            />
          );
        })}

        {/* start (bottom) + end (top) markers */}
        <Circle cx={start.sx} cy={start.sy} r={5} fill={theme.colors.surface} stroke={theme.colors.textMuted} strokeWidth={2} />
        <BarMarker point={end} angle={angle} scale={fitted.scale} />
      </Svg>
    </View>
  );
}

/** A short bar glyph at the current/end position, oriented with the camera. */
function BarMarker({ point, angle, scale }) {
  const half = Math.max(10, scale * 0.09);
  const a = (angle * Math.PI) / 180;
  const dx = Math.cos(a) * half;
  return (
    <>
      <Line
        x1={point.sx - dx}
        y1={point.sy}
        x2={point.sx + dx}
        y2={point.sy}
        stroke={theme.colors.accent}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <Circle cx={point.sx} cy={point.sy} r={4} fill={theme.colors.accent} />
    </>
  );
}

// Project the two ends of the ideal vertical reference line.
function projectIdeal(fitted, angle, ySign) {
  const ys = fitted.points.map((p) => p.y);
  const y = ySign > 0 ? Math.max(...ys) : Math.min(...ys);
  const [p] = projectPath([{ x: 0, y, z: 0, v: 0 }], {
    angleDeg: angle,
    scale: fitted.scale,
    cx: fitted.cx,
    cy: fitted.cy,
  });
  return p;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    backgroundColor: 'transparent',
  },
});
