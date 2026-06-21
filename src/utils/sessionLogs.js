import * as FileSystem from 'expo-file-system';

const KG_PER_LB = 0.453592;
const SESSIONS_DIR = `${FileSystem.documentDirectory || FileSystem.cacheDirectory}sessions`;

function toLb(weight, unit) {
  const numeric = Number(weight);
  if (!Number.isFinite(numeric)) return null;
  return unit === 'kg' ? numeric / KG_PER_LB : numeric;
}

function toKg(weight, unit) {
  const numeric = Number(weight);
  if (!Number.isFinite(numeric)) return null;
  return unit === 'kg' ? numeric : numeric * KG_PER_LB;
}

function normalizeExercise(session) {
  const code = session?.set?.exercise?.code || session?.detectedLift || session?.exercise || 'unknown';
  return String(code).trim().toLowerCase();
}

function estimateE1RMLb(session) {
  const e1rm = session?.set?.e1rm;
  if (!e1rm || !Number.isFinite(e1rm.e1rm)) return null;
  return e1rm.unit === 'kg' ? Math.round(e1rm.e1rm / KG_PER_LB) : Math.round(e1rm.e1rm);
}

function buildSessionLog(session) {
  const setSummary = session?.set?.summary || {};
  const createdAt = new Date(session?.timestamp || Date.now()).toISOString();
  const loadLb = toLb(session?.weight, session?.weightUnit);
  const loadKg = toKg(session?.weight, session?.weightUnit);

  return {
    exercise: normalizeExercise(session),
    load_lb: loadLb != null ? parseFloat(loadLb.toFixed(1)) : null,
    load_kg: loadKg != null ? parseFloat(loadKg.toFixed(1)) : null,
    reps: Array.isArray(session?.repEvents) ? session.repEvents : [],
    velocity_loss_pct:
      typeof setSummary.velocityLossPct === 'number' ? setSummary.velocityLossPct : null,
    e1rm_est_lb: estimateE1RMLb(session),
    created_at: createdAt,
    summary: {
      best_rep_peak_velocity: setSummary.bestRepVelocity ?? null,
      avg_concentric_velocity: setSummary.avgMeanConcentricVelocity ?? null,
      stability_avg: setSummary.avgStability ?? null,
      rom_consistency: setSummary.romConsistency ?? null,
    },
  };
}

export async function saveSessionLog(session) {
  const fileInfo = await FileSystem.getInfoAsync(SESSIONS_DIR);
  if (!fileInfo.exists) {
    await FileSystem.makeDirectoryAsync(SESSIONS_DIR, { intermediates: true });
  }

  const payload = buildSessionLog(session);
  const stamp = (session?.timestamp || Date.now()).toString();
  const filename = `${payload.exercise}_${stamp}.json`;
  const uri = `${SESSIONS_DIR}/${filename}`;

  await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload, null, 2));
  return uri;
}

export async function listSessionLogs() {
  const fileInfo = await FileSystem.getInfoAsync(SESSIONS_DIR);
  if (!fileInfo.exists) return [];
  const names = await FileSystem.readDirectoryAsync(SESSIONS_DIR);
  return names.filter((name) => name.endsWith('.json')).map((name) => `${SESSIONS_DIR}/${name}`);
}
