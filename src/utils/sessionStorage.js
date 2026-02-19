import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const SESSIONS_DIR = `${FileSystem.documentDirectory || FileSystem.cacheDirectory}sessions/`;
const KG_PER_LB = 0.453592;

const ensureDir = async () => {
  const dirInfo = await FileSystem.getInfoAsync(SESSIONS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(SESSIONS_DIR, { intermediates: true });
  }
};

const generateFilename = (exercise, timestamp) => {
  const date = new Date(timestamp);
  const dateStr = date.toISOString().split('T')[0];
  const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
  const exerciseCode = exercise?.code || exercise || 'UNKNOWN';
  return `${dateStr}_${timeStr}_${exerciseCode}.json`;
};

const asNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const saveSessionToFile = async (session, e1rmData = null) => {
  await ensureDir();

  const set = session?.set || session || {};
  const summary = set.summary || {};
  const reps = Array.isArray(set.reps) ? set.reps : [];
  const timestamp = set.endTime || session?.timestamp || Date.now();
  const filename = generateFilename(set.exercise, timestamp);
  const filepath = `${SESSIONS_DIR}${filename}`;

  const avgConcentricVelocity =
    reps.length > 0 ? reps.reduce((sum, rep) => sum + asNumber(rep.meanConV), 0) / reps.length : 0;
  const avgStability =
    reps.length > 0 ? reps.reduce((sum, rep) => sum + asNumber(rep.stability, 100), 0) / reps.length : 100;
  const avgRom = reps.length > 0 ? reps.reduce((sum, rep) => sum + asNumber(rep.rom), 0) / reps.length : 0;
  const bestPeakVelocity = reps.length > 0 ? Math.max(...reps.map((rep) => asNumber(rep.peakV))) : 0;

  const outputE1rm = e1rmData || set.e1rm || null;
  const load = asNumber(set.weight || session?.weight, null);
  const loadUnit = set.weightUnit || session?.weightUnit || 'lb';
  const loadKg = loadUnit === 'kg' ? load : load * KG_PER_LB;

  const sessionData = {
    version: 1,
    created_at: new Date(timestamp).toISOString(),
    exercise: set.exercise?.code || session?.exercise || 'UNKNOWN',
    exercise_name: set.exercise?.name || session?.exercise || 'Unknown',
    load,
    load_unit: loadUnit,
    load_kg: Number.isFinite(loadKg) ? parseFloat(loadKg.toFixed(3)) : null,
    target_reps: set.targetReps || null,
    target_rpe: set.targetRPE || null,
    reps: reps.map((rep, index) => ({
      rep_number: rep.repNumber || index + 1,
      peak_velocity_ms: asNumber(rep.peakV),
      mean_concentric_velocity_ms: asNumber(rep.meanConV),
      mean_eccentric_velocity_ms: asNumber(rep.meanEccV),
      rom_cm: asNumber(rep.rom),
      concentric_time_sec: asNumber(rep.concTime),
      eccentric_time_sec: asNumber(rep.eccTime),
      tempo_sec: asNumber(rep.tempo),
      stability_score: asNumber(rep.stability, 100),
      timestamp: rep.ts || 0,
    })),
    total_reps: reps.length,
    duration_sec: asNumber(summary.duration),
    best_peak_velocity_ms: parseFloat(bestPeakVelocity.toFixed(3)),
    avg_concentric_velocity_ms: parseFloat(avgConcentricVelocity.toFixed(3)),
    velocity_loss_pct: asNumber(summary.velocityLossPct),
    fatigue_level: summary.fatigueLevel || 'unknown',
    e1rm_estimated: outputE1rm?.e1rm ?? null,
    e1rm_unit: outputE1rm?.unit || loadUnit,
    e1rm_confidence: outputE1rm?.confidence ?? null,
    percent_of_e1rm:
      outputE1rm?.e1rm && Number.isFinite(load) ? parseFloat(((load / outputE1rm.e1rm) * 100).toFixed(1)) : null,
    avg_stability: parseFloat(avgStability.toFixed(1)),
    avg_rom_cm: parseFloat(avgRom.toFixed(1)),
  };

  await FileSystem.writeAsStringAsync(filepath, JSON.stringify(sessionData, null, 2));
  return filepath;
};

export const loadAllSessions = async () => {
  await ensureDir();
  const files = await FileSystem.readDirectoryAsync(SESSIONS_DIR);
  const jsonFiles = files.filter((filename) => filename.endsWith('.json'));
  const sessions = [];

  for (const filename of jsonFiles) {
    try {
      const content = await FileSystem.readAsStringAsync(`${SESSIONS_DIR}${filename}`);
      const parsed = JSON.parse(content);
      sessions.push({ ...parsed, _filename: filename });
    } catch (error) {
      console.error(`Failed to read ${filename}:`, error);
    }
  }

  sessions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return sessions;
};

export const exportSession = async (session, e1rmData = null) => {
  const filepath = await saveSessionToFile(session, e1rmData);
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(filepath, {
    mimeType: 'application/json',
    dialogTitle: 'Export Session Data',
  });
  return filepath;
};

export const exportAllSessions = async () => {
  const sessions = await loadAllSessions();
  const payload = {
    exported_at: new Date().toISOString(),
    session_count: sessions.length,
    sessions,
  };
  const exportPath = `${FileSystem.cacheDirectory}liftiq_export_${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(exportPath, JSON.stringify(payload, null, 2));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(exportPath, {
      mimeType: 'application/json',
      dialogTitle: 'Export All Sessions',
    });
  }
  return exportPath;
};
