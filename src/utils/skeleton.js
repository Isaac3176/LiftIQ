/**
 * Humanoid skeleton rig for the Model 6 avatar (Phase B).
 *
 * A joint-based stick figure in a y-up, meters world frame (origin on the floor
 * between the feet). Poses are plain maps of joint name -> {x, y, z}; bones are
 * name pairs. This module owns the rest pose, the bone graph, and the limb
 * lengths the IK solver needs - no rendering or animation here.
 */

export const JOINTS = [
  'ankleL', 'ankleR', 'kneeL', 'kneeR', 'hipL', 'hipR',
  'pelvis', 'chest', 'neck', 'head', 'headTop',
  'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'wristL', 'wristR',
];

// Bone graph: [from, to] joint-name pairs (used for drawing + length calc).
export const BONES = [
  ['ankleL', 'kneeL'], ['kneeL', 'hipL'],
  ['ankleR', 'kneeR'], ['kneeR', 'hipR'],
  ['hipL', 'pelvis'], ['hipR', 'pelvis'],
  ['pelvis', 'chest'], ['chest', 'neck'], ['neck', 'head'], ['head', 'headTop'],
  ['shoulderL', 'shoulderR'],
  ['chest', 'shoulderL'], ['shoulderL', 'elbowL'], ['elbowL', 'wristL'],
  ['chest', 'shoulderR'], ['shoulderR', 'elbowR'], ['elbowR', 'wristR'],
];

// Approximate adult proportions (~1.72 m tall).
const REST = {
  ankleL: { x: -0.10, y: 0.00, z: 0.0 },
  ankleR: { x: 0.10, y: 0.00, z: 0.0 },
  kneeL: { x: -0.11, y: 0.46, z: 0.02 },
  kneeR: { x: 0.11, y: 0.46, z: 0.02 },
  hipL: { x: -0.10, y: 0.92, z: 0.0 },
  hipR: { x: 0.10, y: 0.92, z: 0.0 },
  pelvis: { x: 0.00, y: 0.95, z: 0.0 },
  chest: { x: 0.00, y: 1.28, z: 0.0 },
  neck: { x: 0.00, y: 1.45, z: 0.0 },
  head: { x: 0.00, y: 1.55, z: 0.0 },
  headTop: { x: 0.00, y: 1.72, z: 0.0 },
  shoulderL: { x: -0.19, y: 1.42, z: 0.0 },
  shoulderR: { x: 0.19, y: 1.42, z: 0.0 },
  elbowL: { x: -0.21, y: 1.16, z: 0.02 },
  elbowR: { x: 0.21, y: 1.16, z: 0.02 },
  wristL: { x: -0.22, y: 0.92, z: 0.05 },
  wristR: { x: 0.22, y: 0.92, z: 0.05 },
};

export function restPose() {
  return clonePose(REST);
}

export function clonePose(pose) {
  const out = {};
  for (const name of JOINTS) {
    const p = pose[name] || { x: 0, y: 0, z: 0 };
    out[name] = { x: p.x, y: p.y, z: p.z };
  }
  return out;
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Segment lengths (meters) derived from the rest pose, symmetric L/R averaged
 * so the IK targets stay stable across sides.
 */
export function limbLengths(pose = REST) {
  const avg = (a, b) => (a + b) / 2;
  return {
    upperArm: avg(dist(pose.shoulderL, pose.elbowL), dist(pose.shoulderR, pose.elbowR)),
    foreArm: avg(dist(pose.elbowL, pose.wristL), dist(pose.elbowR, pose.wristR)),
    thigh: avg(dist(pose.hipL, pose.kneeL), dist(pose.hipR, pose.kneeR)),
    shin: avg(dist(pose.kneeL, pose.ankleL), dist(pose.kneeR, pose.ankleR)),
  };
}

/** Resolve the bone graph into drawable 3D segments for a given pose. */
export function getBoneSegments(pose) {
  const segments = [];
  for (const [aName, bName] of BONES) {
    const a = pose[aName];
    const b = pose[bName];
    if (a && b) segments.push({ a, b, from: aName, to: bName });
  }
  return segments;
}
