/**
 * Pose driver for the Model 6 avatar (Phase B).
 *
 * Turns a reconstructed bar path (from barPath.reconstructPath) + an exercise
 * type into a sequence of skeleton poses. The bar's normalized vertical travel
 * drives a movement-pattern model (squat / hinge / press / curl / row /
 * generic); arms and legs are closed with the two-bone IK solver.
 *
 * Output frames are consumed by SkeletonAvatar3D for rendering/animation.
 */

import { restPose, limbLengths, clonePose } from './skeleton';
import { solveTwoBoneIK } from './ik';

const L = limbLengths();

/** Map an exercise code/name to a movement pattern. */
export function classifyPattern(exercise) {
  const code = (exercise?.code || exercise?.exercise?.code || '').toString().toLowerCase();
  const name = (exercise?.name || exercise?.exercise?.name || exercise || '').toString().toLowerCase();
  const s = `${code} ${name}`;
  if (/(squat|smith|sms|shss|leg|lunge|ssl)/.test(s)) return 'squat';
  if (/(dead|hinge|rdl|good\s*morning|ht|hip\s*thrust)/.test(s)) return 'hinge';
  if (/(bench|press|ohp|dbp|mibp|dsp|msp|push|bp)/.test(s)) return 'press';
  if (/(curl|prec|idbc|aidbc|bicep|dwc)/.test(s)) return 'curl';
  if (/(row|pull|pulldown|sblp|cgcr|ngcr|apull|mgtbr|sap)/.test(s)) return 'row';
  return 'generic';
}

function shift(pose, names, dx, dy, dz) {
  for (const n of names) {
    pose[n].x += dx;
    pose[n].y += dy;
    pose[n].z += dz;
  }
}

const UPPER_BODY = ['chest', 'neck', 'head', 'headTop', 'shoulderL', 'shoulderR'];

/**
 * Solve both arms toward their targets. Wrists are snapped to the IK-clamped
 * end (never the raw target) so bone lengths stay exact, and the bar is returned
 * at the midpoint of the solved wrists so the hands always hold it.
 */
function solveArms(pose, wristL, wristR, poleL, poleR) {
  const rL = solveTwoBoneIK(pose.shoulderL, wristL, L.upperArm, L.foreArm, poleL);
  const rR = solveTwoBoneIK(pose.shoulderR, wristR, L.upperArm, L.foreArm, poleR);
  pose.wristL = rL.end;
  pose.wristR = rR.end;
  pose.elbowL = rL.mid;
  pose.elbowR = rR.mid;
  return { x: (rL.end.x + rR.end.x) / 2, y: (rL.end.y + rR.end.y) / 2, z: (rL.end.z + rR.end.z) / 2 };
}

function solveLegs(pose) {
  // Ankles stay planted; knees bend forward as the hips lower.
  pose.kneeL = solveTwoBoneIK(pose.hipL, pose.ankleL, L.thigh, L.shin, { x: 0, y: 0, z: 1 }).mid;
  pose.kneeR = solveTwoBoneIK(pose.hipR, pose.ankleR, L.thigh, L.shin, { x: 0, y: 0, z: 1 }).mid;
}

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Build a single pose. `depth` is 0 at the top of the ROM, 1 at the bottom.
 * Returns { pose, bar:{x,y,z} } (bar position for rendering).
 */
export function buildPose(pattern, depth, lateral = 0) {
  const pose = restPose();
  const d = Math.max(0, Math.min(1, depth));

  switch (pattern) {
    case 'squat': {
      const drop = d * 0.40;
      const lean = d * 0.16;
      shift(pose, ['pelvis', 'hipL', 'hipR'], 0, -drop, lean * 0.4);
      shift(pose, UPPER_BODY, 0, -drop * 0.92, lean);
      solveLegs(pose);
      const wL = { x: pose.shoulderL.x - 0.04, y: pose.shoulderL.y - 0.01, z: pose.shoulderL.z - 0.1 };
      const wR = { x: pose.shoulderR.x + 0.04, y: pose.shoulderR.y - 0.01, z: pose.shoulderR.z - 0.1 };
      const bar = solveArms(pose, wL, wR, { x: -1, y: -0.4, z: 0 }, { x: 1, y: -0.4, z: 0 });
      return { pose, bar };
    }

    case 'hinge': {
      const drop = d * 0.12;
      const hingeBack = d * 0.16;
      const lean = d * 0.34;
      shift(pose, ['pelvis', 'hipL', 'hipR'], 0, -drop, -hingeBack);
      shift(pose, UPPER_BODY, 0, -lean * 0.7, lean);
      solveLegs(pose);
      // Arms hang straight from the shoulders; the bar rides the hands as the
      // torso hinges, so it stays reachable and tracks the lift.
      const armLen = (L.upperArm + L.foreArm) * 0.98;
      const wL = { x: pose.shoulderL.x, y: pose.shoulderL.y - armLen, z: pose.shoulderL.z + 0.06 };
      const wR = { x: pose.shoulderR.x, y: pose.shoulderR.y - armLen, z: pose.shoulderR.z + 0.06 };
      const bar = solveArms(pose, wL, wR, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 });
      return { pose, bar };
    }

    case 'press': {
      const top = pose.headTop.y + 0.16;
      const bottom = pose.chest.y + 0.06;
      const barY = lerp(top, bottom, d);
      const wL = { x: -0.18 + lateral, y: barY, z: 0.03 };
      const wR = { x: 0.18 + lateral, y: barY, z: 0.03 };
      const bar = solveArms(pose, wL, wR, { x: -1, y: -0.3, z: 0 }, { x: 1, y: -0.3, z: 0 });
      return { pose, bar };
    }

    case 'curl': {
      const wristY = lerp(1.28, 0.86, d);
      const wL = { x: pose.elbowL.x, y: wristY, z: 0.2 };
      const wR = { x: pose.elbowR.x, y: wristY, z: 0.2 };
      // Pin the upper arm: rotate only the forearm around the (rest) elbow.
      pose.wristL = forearmFromElbow(pose.elbowL, wL);
      pose.wristR = forearmFromElbow(pose.elbowR, wR);
      const bar = {
        x: (pose.wristL.x + pose.wristR.x) / 2,
        y: (pose.wristL.y + pose.wristR.y) / 2,
        z: (pose.wristL.z + pose.wristR.z) / 2,
      };
      return { pose, bar };
    }

    case 'row': {
      shift(pose, ['pelvis', 'hipL', 'hipR'], 0, -0.06, -0.04);
      shift(pose, UPPER_BODY, 0, -0.22, 0.34);
      solveLegs(pose);
      // bar comes to the torso at the top of the pull (d -> 0)
      const wristY = lerp(pose.chest.y - 0.05, pose.chest.y - 0.42, d);
      const wZ = lerp(pose.chest.z + 0.05, pose.chest.z + 0.34, d);
      const wL = { x: pose.shoulderL.x, y: wristY, z: wZ };
      const wR = { x: pose.shoulderR.x, y: wristY, z: wZ };
      const bar = solveArms(pose, wL, wR, { x: 0, y: -1, z: -0.3 }, { x: 0, y: -1, z: -0.3 });
      return { pose, bar };
    }

    default: {
      const drop = d * 0.12;
      shift(pose, ['pelvis', 'hipL', 'hipR'], 0, -drop, 0);
      shift(pose, UPPER_BODY, 0, -drop, 0);
      solveLegs(pose);
      const barY = lerp(1.2, 0.92, d);
      const wL = { x: -0.22 + lateral, y: barY, z: 0.12 };
      const wR = { x: 0.22 + lateral, y: barY, z: 0.12 };
      const bar = solveArms(pose, wL, wR, { x: -1, y: -0.4, z: 0 }, { x: 1, y: -0.4, z: 0 });
      return { pose, bar };
    }
  }
}

function forearmFromElbow(elbow, target) {
  const dx = target.x - elbow.x;
  const dy = target.y - elbow.y;
  const dz = target.z - elbow.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  return {
    x: elbow.x + (dx / len) * L.foreArm,
    y: elbow.y + (dy / len) * L.foreArm,
    z: elbow.z + (dz / len) * L.foreArm,
  };
}

/**
 * Build the full pose sequence for a reconstructed bar path.
 * @param {Array<{x,y,z,v}>} points - reconstructed 3D bar path
 * @param exercise - exercise descriptor (code/name) for pattern classification
 * @returns {{ frames: Array<{pose, bar, v, depth}>, pattern: string }}
 */
export function generatePoseSequence(points, exercise) {
  const pattern = classifyPattern(exercise);
  if (!Array.isArray(points) || points.length < 2) {
    const { pose, bar } = buildPose(pattern, 0);
    return { frames: [{ pose, bar, v: 0, depth: 0 }], pattern };
  }

  const ys = points.map((p) => p.y);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const span = yMax - yMin || 1;

  const frames = points.map((p) => {
    const depth = (yMax - p.y) / span; // 0 at top, 1 at bottom
    const { pose, bar } = buildPose(pattern, depth, clamp(p.x, -0.15, 0.15));
    return { pose, bar, v: p.v, depth };
  });

  return { frames, pattern };
}

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

export { clonePose };
