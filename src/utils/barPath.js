/**
 * Bar-path reconstruction + 3D projection (Model 6, Phase A).
 *
 * Reconstructs a 3D barbell trajectory from the IMU telemetry the app already
 * captures during a set (`sessionData.samples`, the 10 Hz `rep_update` stream),
 * then projects it to 2D for SVG rendering. No WebGL dependency - a rotation +
 * tilt orthographic projection is enough for a clean, stable bar-path view.
 *
 * Coordinate frame (meters): x = forward/back, y = up, z = lateral.
 * Vertical comes from integrated displacement; horizontal drift is derived from
 * how far orientation (pitch/roll) deviates from the bar's resting attitude.
 */

const DEG2RAD = Math.PI / 180;

// Effective lever arm (m) converting orientation tilt -> bar-end displacement.
const LEVER_M = 0.35;
// Horizontal drift is small vs vertical travel; exaggerate it for the *view*
// only (true cm are reported separately in the metrics).
const DEFAULT_DRIFT_EXAGGERATION = 3.0;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Normalize a session's `samples` array into clean telemetry rows.
 * Accepts both the live `rep_update` shape (roll/pitch/yaw/displacement) and
 * the Pi raw-points shape returned by `requestSessionRaw`.
 */
export function extractTelemetry(samples) {
  if (!Array.isArray(samples)) return [];
  const rows = [];
  for (const s of samples) {
    if (!s) continue;
    const displacement = num(s.displacement);
    const roll = num(s.roll);
    const pitch = num(s.pitch);
    if (displacement == null && roll == null && pitch == null) continue;
    rows.push({
      t: num(s.t) ?? num(s.timestamp) ?? rows.length,
      displacement: displacement ?? 0,
      roll: roll ?? 0,
      pitch: pitch ?? 0,
      yaw: num(s.yaw) ?? 0,
      velocity: num(s.velocity) ?? 0,
    });
  }
  return rows;
}

/**
 * Reconstruct the 3D bar path from raw telemetry rows.
 * Returns { points: [{x,y,z,v,t}], hasData }.
 */
export function reconstructPath(samples) {
  const rows = extractTelemetry(samples);
  if (rows.length < 3) return { points: [], hasData: false };

  // Resting attitude = median of the opening samples (bar held still at start).
  const head = rows.slice(0, Math.min(8, rows.length));
  const pitch0 = median(head.map((r) => r.pitch));
  const roll0 = median(head.map((r) => r.roll));

  const points = rows.map((r) => ({
    x: Math.sin((r.pitch - pitch0) * DEG2RAD) * LEVER_M, // forward/back lean
    y: r.displacement, // vertical travel (m)
    z: Math.sin((r.roll - roll0) * DEG2RAD) * LEVER_M, // lateral drift
    v: Math.abs(r.velocity),
    t: r.t,
  }));

  return { points, hasData: true };
}

/**
 * Bar-path quality metrics, computed on TRUE (un-exaggerated) coordinates.
 */
export function computePathMetrics(points) {
  if (!points || points.length < 2) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const zs = points.map((p) => p.z);
  const vs = points.map((p) => p.v);

  const verticalRangeM = Math.max(...ys) - Math.min(...ys);
  const forwardDriftM = Math.max(...xs) - Math.min(...xs);
  const lateralDriftM = Math.max(...zs) - Math.min(...zs);
  const horizontalDriftM = Math.hypot(forwardDriftM, lateralDriftM);

  const verticalRangeCm = verticalRangeM * 100;
  const denom = verticalRangeM > 1e-4 ? verticalRangeM : 1e-4;
  const verticalityScore = Math.max(0, Math.min(100, 100 * (1 - horizontalDriftM / denom)));

  // Net forward shift bottom -> top tells us the arc shape.
  const netForwardCm = (points[points.length - 1].x - points[0].x) * 100;
  let arcType = 'Vertical';
  if (Math.abs(netForwardCm) >= 2) arcType = netForwardCm < 0 ? 'Forward drift' : 'Backward drift';
  if (forwardDriftM * 100 >= 6 && Math.abs(netForwardCm) < 3) arcType = 'J-curve';

  return {
    verticalRangeCm: round1(verticalRangeCm),
    forwardDriftCm: round1(forwardDriftM * 100),
    lateralDriftCm: round1(lateralDriftM * 100),
    horizontalDriftCm: round1(horizontalDriftM * 100),
    verticalityScore: Math.round(verticalityScore),
    peakVelocity: round2(Math.max(...vs)),
    arcType,
  };
}

/**
 * Rotation (around vertical Y) + tilt (around X) orthographic projection.
 * Returns screen-space points with a depth value (for painter ordering / fade).
 */
export function projectPath(points, { angleDeg = 0, tiltDeg = 18, scale = 1, cx = 0, cy = 0 } = {}) {
  const a = angleDeg * DEG2RAD;
  const t = tiltDeg * DEG2RAD;
  const cosA = Math.cos(a);
  const sinA = Math.sin(a);
  const cosT = Math.cos(t);
  const sinT = Math.sin(t);

  return points.map((p) => {
    const xr = p.x * cosA - p.z * sinA;
    const zr = p.x * sinA + p.z * cosA;
    const yr = p.y * cosT - zr * sinT;
    const depth = p.y * sinT + zr * cosT;
    return {
      sx: cx + xr * scale,
      sy: cy - yr * scale,
      depth,
      v: p.v,
    };
  });
}

/**
 * Center + scale a path so it fills a viewport. Horizontal drift is exaggerated
 * for legibility (vertical stays true), keeping a portrait bar-path look.
 */
export function fitPathToView(points, { width, height, padding = 36, driftExaggeration = DEFAULT_DRIFT_EXAGGERATION } = {}) {
  if (!points.length) return { points: [], scale: 1, cx: width / 2, cy: height / 2 };

  const ys = points.map((p) => p.y);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const yMid = (yMin + yMax) / 2;

  const cxWorld = mean(points.map((p) => p.x));
  const czWorld = mean(points.map((p) => p.z));

  // Re-center and exaggerate horizontal axes for the view.
  const viewPoints = points.map((p) => ({
    x: (p.x - cxWorld) * driftExaggeration,
    y: p.y - yMid,
    z: (p.z - czWorld) * driftExaggeration,
    v: p.v,
    t: p.t,
  }));

  const spanY = Math.max(yMax - yMin, 0.05);
  const spanX = Math.max(...viewPoints.map((p) => Math.hypot(p.x, p.z)), 0.05) * 2;
  const scale = Math.min(
    (height - padding * 2) / spanY,
    (width - padding * 2) / spanX
  );

  return { points: viewPoints, scale, cx: width / 2, cy: height / 2 };
}

/**
 * Map a velocity to a color: fast = green, slowing = amber, slowest = red.
 * Relative to the set's own peak so it reads as "where did the bar slow down".
 */
export function velocityColor(v, peak) {
  const ratio = peak > 0 ? Math.max(0, Math.min(1, v / peak)) : 0;
  if (ratio >= 0.66) return '#36D399'; // success
  if (ratio >= 0.4) return '#ffbc42'; // warning
  if (ratio >= 0.18) return '#FF9800';
  return '#ff5d73'; // danger
}

/**
 * Synthesize a stylized path from per-rep metrics when no sample stream exists
 * (older sessions). Stacks each rep as a vertical stroke sized by ROM, with a
 * little drift, colored by that rep's peak velocity.
 */
export function synthPathFromReps(reps) {
  if (!Array.isArray(reps) || reps.length < 1) return { points: [], hasData: false };
  const points = [];
  const STEPS = 10;
  reps.forEach((rep, i) => {
    const romM = (num(rep.rom) ?? num(rep.romCm) ?? 30) / 100; // cm -> m
    const v = num(rep.peakV) ?? num(rep.peakVelocityMs) ?? 0.3;
    const drift = (i % 2 === 0 ? 1 : -1) * 0.015 * (1 + i * 0.05);
    for (let s = 0; s <= STEPS; s += 1) {
      const frac = s / STEPS;
      points.push({
        x: drift * Math.sin(frac * Math.PI),
        y: i * 0.04 + frac * romM,
        z: 0,
        v: v * (0.6 + 0.4 * Math.sin(frac * Math.PI)),
        t: i * STEPS + s,
      });
    }
  });
  return { points, hasData: points.length >= 3, synthesized: true };
}

/**
 * A built-in demo J-curve so the viewer always renders something (e.g. before a
 * first real set, or in a portfolio screenshot).
 */
export function demoPath() {
  const points = [];
  const N = 80;
  for (let i = 0; i <= N; i += 1) {
    const frac = i / N;
    const y = frac * 0.55; // ~55 cm pull
    const x = -0.06 * Math.sin(frac * Math.PI) - 0.02 * frac; // forward then back (J)
    const z = 0.012 * Math.sin(frac * Math.PI * 2);
    const v = 0.2 + 0.7 * Math.sin(frac * Math.PI);
    points.push({ x, y, z, v, t: i });
  }
  return { points, hasData: true, demo: true };
}

function mean(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}
function round1(v) {
  return Math.round(v * 10) / 10;
}
function round2(v) {
  return Math.round(v * 100) / 100;
}
