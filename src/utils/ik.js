/**
 * Analytic two-bone inverse kinematics for the Model 6 avatar (Phase B).
 *
 * Given a fixed root (shoulder/hip), an end target (wrist/ankle), the two bone
 * lengths, and a pole hint (which way the joint should bend), solve the middle
 * joint (elbow/knee) with the law of cosines. Pure 3D vector math - no rendering.
 */

export const v = {
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
  scale: (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s }),
  dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
  len: (a) => Math.hypot(a.x, a.y, a.z),
  norm: (a) => {
    const l = Math.hypot(a.x, a.y, a.z) || 1;
    return { x: a.x / l, y: a.y / l, z: a.z / l };
  },
  lerp: (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }),
};

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/**
 * Solve a two-bone chain.
 *
 * @param {{x,y,z}} root   fixed proximal joint (shoulder/hip)
 * @param {{x,y,z}} target desired end-effector position (wrist/ankle)
 * @param {number}  l1     proximal bone length (upper arm / thigh)
 * @param {number}  l2     distal bone length (forearm / shin)
 * @param {{x,y,z}} pole   world direction the mid joint should bend toward
 * @returns {{ mid:{x,y,z}, end:{x,y,z}, reachable:boolean }}
 *          `end` is the (possibly clamped-to-reachable) effector position.
 */
export function solveTwoBoneIK(root, target, l1, l2, pole) {
  const reach = l1 + l2;
  const toTarget = v.sub(target, root);
  let d = v.len(toTarget);
  const reachable = d <= reach - 1e-4 && d >= Math.abs(l1 - l2) + 1e-4;

  // Clamp the effective distance into the solvable annulus.
  const dEff = clamp(d, Math.abs(l1 - l2) + 1e-4, reach - 1e-4);
  const axis = d > 1e-6 ? v.scale(toTarget, 1 / d) : { x: 0, y: -1, z: 0 };
  const end = v.add(root, v.scale(axis, dEff));

  // Perpendicular bend direction in the plane of (axis, pole).
  let perp = v.sub(pole, v.scale(axis, v.dot(pole, axis)));
  if (v.len(perp) < 1e-5) {
    // pole parallel to axis: fall back to any perpendicular vector.
    const ref = Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    perp = v.sub(ref, v.scale(axis, v.dot(ref, axis)));
  }
  perp = v.norm(perp);

  // Law of cosines: angle at root between axis and (root->mid).
  const cosA = clamp((l1 * l1 + dEff * dEff - l2 * l2) / (2 * l1 * dEff), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);

  const mid = v.add(root, v.add(v.scale(axis, l1 * cosA), v.scale(perp, l1 * sinA)));

  return { mid, end, reachable };
}
