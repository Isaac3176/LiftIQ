import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const EXERCISES = [
  { code: 'SBLP', name: 'Straight Bar Lat Pulldown' },
  { code: 'CGCR', name: 'Close Grip Cable Row' },
  { code: 'NGCR', name: 'Neutral Grip Cable Row' },
  { code: '30DBP', name: '30 Incline Dumbbell Press' },
  { code: '45DBP', name: '45 Incline Dumbbell Press' },
  { code: 'DSP', name: 'Dumbbell Shoulder Press' },
  { code: 'DLR', name: 'Dumbbell Lateral Raise' },
  { code: 'MTE', name: 'Machine Tricep Extension' },
  { code: 'PREC', name: 'Preacher Curls' },
  { code: 'IDBC', name: 'Incline Dumbbell Bicep Curl' },
  { code: 'APULL', name: 'Assisted Pullup' },
  { code: 'MSP', name: 'Machine Shoulder Press' },
  { code: 'MIBP', name: 'Machine Incline Bench Press' },
  { code: 'OTHER', name: 'Other Exercise' },
];

const COMMON_WEIGHTS_LB = [45, 95, 135, 185, 225, 275, 315, 365, 405];
const COMMON_WEIGHTS_KG = [20, 40, 60, 80, 100, 120, 140, 160, 180];

export default function StartSetModal({
  visible,
  onClose,
  onStart,
  detectedExercise,
  initialWeight,
  initialWeightUnit = 'lb',
}) {
  const [exercise, setExercise] = useState(null);
  const [weight, setWeight] = useState(null);
  const [weightUnit, setWeightUnit] = useState('lb');
  const [customWeight, setCustomWeight] = useState('');
  const [targetReps, setTargetReps] = useState('');
  const [targetRPE, setTargetRPE] = useState('');
  const [showExercisePicker, setShowExercisePicker] = useState(false);

  const commonWeights = useMemo(
    () => (weightUnit === 'lb' ? COMMON_WEIGHTS_LB : COMMON_WEIGHTS_KG),
    [weightUnit]
  );

  useEffect(() => {
    if (!visible) return;
    setExercise(detectedExercise || null);
    setWeight(initialWeight || null);
    setWeightUnit(initialWeightUnit || 'lb');
    setCustomWeight('');
    setTargetReps('');
    setTargetRPE('');
    setShowExercisePicker(false);
  }, [visible, detectedExercise, initialWeight, initialWeightUnit]);

  const handleCustomWeight = () => {
    const value = parseFloat(customWeight);
    if (!Number.isFinite(value) || value <= 0) return;
    setWeight(value);
    setCustomWeight('');
  };

  const handleStart = () => {
    if (!exercise || !weight) return;
    onStart({
      exercise,
      weight: parseFloat(weight),
      weightUnit,
      targetReps: targetReps ? parseInt(targetReps, 10) : null,
      targetRPE: targetRPE ? parseFloat(targetRPE) : null,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Start Set</Text>

            <Text style={styles.sectionLabel}>EXERCISE</Text>
            <TouchableOpacity style={styles.exerciseSelector} onPress={() => setShowExercisePicker(true)}>
              <Text style={exercise ? styles.exerciseText : styles.exercisePlaceholder}>
                {exercise ? exercise.name : 'Select exercise...'}
              </Text>
              <Text style={styles.chevron}>{'>'}</Text>
            </TouchableOpacity>

            {detectedExercise && !exercise && (
              <TouchableOpacity style={styles.detectedHint} onPress={() => setExercise(detectedExercise)}>
                <Text style={styles.detectedHintText}>Detected: {detectedExercise.name} - Tap to use</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.sectionLabel}>WEIGHT</Text>
            <View style={styles.unitToggleRow}>
              <TouchableOpacity
                style={[styles.unitButton, weightUnit === 'lb' && styles.unitButtonActive]}
                onPress={() => setWeightUnit('lb')}
              >
                <Text style={[styles.unitText, weightUnit === 'lb' && styles.unitTextActive]}>lb</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.unitButton, weightUnit === 'kg' && styles.unitButtonActive]}
                onPress={() => setWeightUnit('kg')}
              >
                <Text style={[styles.unitText, weightUnit === 'kg' && styles.unitTextActive]}>kg</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weightScroll}>
              {commonWeights.map((entry) => (
                <TouchableOpacity
                  key={`${weightUnit}-${entry}`}
                  style={[styles.weightButton, weight === entry && styles.weightButtonActive]}
                  onPress={() => setWeight(entry)}
                >
                  <Text style={[styles.weightButtonText, weight === entry && styles.weightButtonTextActive]}>
                    {entry}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.customWeightRow}>
              <TextInput
                style={styles.customWeightInput}
                value={customWeight}
                onChangeText={setCustomWeight}
                placeholder="Custom"
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
              />
              <TouchableOpacity style={styles.customWeightButton} onPress={handleCustomWeight}>
                <Text style={styles.customWeightButtonText}>Set</Text>
              </TouchableOpacity>
            </View>

            {weight ? <Text style={styles.selectedWeight}>Selected: {weight} {weightUnit}</Text> : null}

            <Text style={styles.sectionLabel}>TARGETS (OPTIONAL)</Text>
            <View style={styles.targetsRow}>
              <View style={styles.targetInput}>
                <Text style={styles.targetLabel}>Reps</Text>
                <TextInput
                  style={styles.targetField}
                  value={targetReps}
                  onChangeText={setTargetReps}
                  placeholder="-"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.targetInput}>
                <Text style={styles.targetLabel}>RPE</Text>
                <TextInput
                  style={styles.targetField}
                  value={targetRPE}
                  onChangeText={setTargetRPE}
                  placeholder="-"
                  placeholderTextColor="#666"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.startButton, (!exercise || !weight) && styles.startButtonDisabled]}
                onPress={handleStart}
                disabled={!exercise || !weight}
              >
                <Text style={styles.startButtonText}>Start Set</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <Modal visible={showExercisePicker} animationType="slide" transparent onRequestClose={() => setShowExercisePicker(false)}>
            <View style={styles.overlay}>
              <View style={styles.exercisePickerModal}>
                <Text style={styles.exercisePickerTitle}>Select Exercise</Text>
                <ScrollView>
                  {EXERCISES.map((entry) => (
                    <TouchableOpacity
                      key={entry.code}
                      style={[styles.exerciseOption, exercise?.code === entry.code && styles.exerciseOptionActive]}
                      onPress={() => {
                        setExercise(entry);
                        setShowExercisePicker(false);
                      }}
                    >
                      <Text style={styles.exerciseOptionCode}>{entry.code}</Text>
                      <Text style={styles.exerciseOptionName}>{entry.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity style={styles.exercisePickerClose} onPress={() => setShowExercisePicker(false)}>
                  <Text style={styles.exercisePickerCloseText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 12,
    color: '#888',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 16,
  },
  exerciseSelector: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseText: {
    fontSize: 16,
    color: '#fff',
  },
  exercisePlaceholder: {
    fontSize: 16,
    color: '#666',
  },
  chevron: {
    fontSize: 24,
    color: '#666',
  },
  detectedHint: {
    backgroundColor: '#1a3a1a',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  detectedHintText: {
    fontSize: 14,
    color: '#4CAF50',
  },
  unitToggleRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  unitButton: {
    backgroundColor: '#252525',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginRight: 8,
  },
  unitButtonActive: {
    backgroundColor: '#4CAF50',
  },
  unitText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '700',
  },
  unitTextActive: {
    color: '#fff',
  },
  weightScroll: {
    marginBottom: 12,
  },
  weightButton: {
    backgroundColor: '#252525',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginRight: 8,
    minWidth: 55,
    alignItems: 'center',
  },
  weightButtonActive: {
    backgroundColor: '#4CAF50',
  },
  weightButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '700',
  },
  weightButtonTextActive: {
    color: '#fff',
  },
  customWeightRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  customWeightInput: {
    flex: 1,
    backgroundColor: '#252525',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    marginRight: 8,
  },
  customWeightButton: {
    backgroundColor: '#333',
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  customWeightButtonText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '700',
  },
  selectedWeight: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '700',
    marginTop: 4,
  },
  targetsRow: {
    flexDirection: 'row',
  },
  targetInput: {
    flex: 1,
    marginRight: 12,
  },
  targetLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  targetField: {
    backgroundColor: '#252525',
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#333',
    borderRadius: 12,
    padding: 16,
    marginRight: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#fff',
  },
  startButton: {
    flex: 2,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  startButtonDisabled: {
    backgroundColor: '#333',
  },
  startButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '700',
  },
  exercisePickerModal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxHeight: '70%',
  },
  exercisePickerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  exerciseOption: {
    backgroundColor: '#252525',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  exerciseOptionActive: {
    backgroundColor: '#1a3a1a',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  exerciseOptionCode: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '700',
    width: 60,
  },
  exerciseOptionName: {
    fontSize: 14,
    color: '#fff',
    flex: 1,
  },
  exercisePickerClose: {
    backgroundColor: '#333',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    alignItems: 'center',
  },
  exercisePickerCloseText: {
    fontSize: 16,
    color: '#fff',
  },
});
