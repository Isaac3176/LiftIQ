import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Line } from 'react-native-svg';
import { theme } from '../theme/performanceLabTheme';
import { BONES, JOINTS } from '../utils/skeleton';
import { projectPath } from '../utils/barPath';

const CENTER_Y = 0.95; // world-y placed at the viewport center (~hip height)
const TILT_DEG = 14;
const FIGURE_HEIGHT_M = 1.95; // headroom above the 1.72 m rig

/**
 * Render a single skeleton pose with react-native-svg (no WebGL).
 *
 * Reuses the Phase A rotation+tilt projection so the avatar shares the bar
 * path's camera. Animation is driven by the parent swapping `pose`/`bar`.
 *
 * Props:
 *  - pose: joint map { name: {x,y,z} }
 *  - bar: bar position { x,y,z } (drawn as a loaded barbell)
 *  - width/height: viewport size
 *  - angleDeg: camera yaw
 *  - boneColor: optional override for limb color
 */
export default function SkeletonAvatar3D({
  pose,
  bar,
  width = 320,
  height = 360,
  angleDeg = 20,
  boneColor,
}) {
  const scale = (height - 56) / FIGURE_HEIGHT_M;

  const scene = useMemo(() => {
    if (!pose) return null;

    const order = JOINTS;
    const world = order.map((n) => ({ x: pose[n].x, y: pose[n].y - CENTER_Y, z: pose[n].z }));
    const barPt = bar ? { x: bar.x, y: bar.y - CENTER_Y, z: bar.z } : null;
    const footL = { x: pose.ankleL.x, y: -CENTER_Y, z: pose.ankleL.z };
    const footR = { x: pose.ankleR.x, y: -CENTER_Y, z: pose.ankleR.z };

    const batch = [...world, footL, footR, ...(barPt ? [barPt] : [])];
    const proj = projectPath(batch, { angleDeg, tiltDeg: TILT_DEG, scale, cx: width / 2, cy: height / 2 });

    const P = {};
    order.forEach((n, i) => { P[n] = proj[i]; });
    const fL = proj[order.length];
    const fR = proj[order.length + 1];
    const barProj = barPt ? proj[order.length + 2] : null;

    const depths = proj.map((p) => p.depth);
    const depthMin = Math.min(...depths);
    const depthSpan = Math.max(...depths) - depthMin || 1;

    return { P, fL, fR, barProj, depthMin, depthSpan };
  }, [pose, bar, angleDeg, scale, width, height]);

  if (!scene) return <View style={{ width, height }} />;

  const { P, fL, fR, barProj, depthMin, depthSpan } = scene;
  const limb = boneColor || theme.colors.accent;
  const headR = Math.max(8, scale * 0.085);
  const shadowY = (fL.sy + fR.sy) / 2;
  const stance = Math.abs(fR.sx - fL.sx);

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height}>
        {/* ground shadow */}
        <Ellipse
          cx={width / 2}
          cy={shadowY + 4}
          rx={Math.max(26, stance * 0.9 + 26)}
          ry={9}
          fill="#000000"
          opacity={0.28}
        />

        {/* bones */}
        {BONES.map(([a, b], i) => {
          const pa = P[a];
          const pb = P[b];
          const depthNorm = ((pa.depth + pb.depth) / 2 - depthMin) / depthSpan;
          return (
            <Line
              key={i}
              x1={pa.sx}
              y1={pa.sy}
              x2={pb.sx}
              y2={pb.sy}
              stroke={limb}
              strokeWidth={3.2 + depthNorm * 2.2}
              strokeLinecap="round"
              opacity={0.5 + depthNorm * 0.5}
            />
          );
        })}

        {/* joints */}
        {JOINTS.filter((n) => n !== 'head' && n !== 'headTop' && n !== 'neck').map((n) => (
          <Circle key={n} cx={P[n].sx} cy={P[n].sy} r={3} fill={theme.colors.textPrimary} opacity={0.85} />
        ))}

        {/* head */}
        <Circle
          cx={(P.head.sx + P.headTop.sx) / 2}
          cy={(P.head.sy + P.headTop.sy) / 2}
          r={headR}
          fill={theme.colors.surface}
          stroke={limb}
          strokeWidth={3}
        />

        {/* barbell */}
        {barProj && <Barbell point={barProj} angle={angleDeg} scale={scale} />}
      </Svg>
    </View>
  );
}

function Barbell({ point, angle, scale }) {
  const half = Math.max(16, scale * 0.22);
  const a = (angle * Math.PI) / 180;
  const dx = Math.cos(a) * half;
  const plate = Math.max(5, scale * 0.05);
  return (
    <>
      <Line
        x1={point.sx - dx}
        y1={point.sy}
        x2={point.sx + dx}
        y2={point.sy}
        stroke={theme.colors.textSecondary}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Circle cx={point.sx - dx} cy={point.sy} r={plate} fill={theme.colors.accent} />
      <Circle cx={point.sx + dx} cy={point.sy} r={plate} fill={theme.colors.accent} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
});
