"""
Export trained model to TensorFlow Lite for mobile deployment.

Input: ml/models/lift_classifier.h5
Output: ml/models/lift_classifier.tflite, ml/models/lift_classifier_metadata.json

Usage:
    python export_tflite.py
    python export_tflite.py --quantize float16
"""

import os
import json
import argparse
import numpy as np
from pathlib import Path

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
import tensorflow as tf

# =============================================================================
# Configuration
# =============================================================================

MODEL_PATH = 'ml/models/lift_classifier.h5'
BEST_MODEL_PATH = 'ml/models/lift_classifier_best.h5'
DATA_PATH = 'ml/data/gym_imu_processed/windows.npz'
METADATA_PATH = 'ml/data/gym_imu_processed/metadata.json'
OUTPUT_DIR = 'ml/models'

CONFIDENCE_THRESHOLD = 0.6


# =============================================================================
# Export Functions
# =============================================================================

def export_tflite(model_path: str, output_path: str, quantize: str = None):
    """Convert Keras model to TFLite."""
    print(f"Loading: {model_path}")
    model = tf.keras.models.load_model(model_path)
    
    print("Converting to TFLite...")
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    
    if quantize == 'float16':
        print("Applying float16 quantization...")
        converter.target_spec.supported_types = [tf.float16]
    
    tflite_model = converter.convert()
    
    with open(output_path, 'wb') as f:
        f.write(tflite_model)
    
    size_kb = len(tflite_model) / 1024
    print(f"Saved: {output_path} ({size_kb:.1f} KB)")
    
    return tflite_model


def verify_model(tflite_path: str):
    """Verify TFLite model."""
    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()
    
    print(f"\nInput: {input_details[0]['shape']} {input_details[0]['dtype']}")
    print(f"Output: {output_details[0]['shape']}")
    
    # Test inference
    import time
    test_input = np.random.randn(*input_details[0]['shape']).astype(np.float32)
    
    times = []
    for _ in range(10):
        start = time.perf_counter()
        interpreter.set_tensor(input_details[0]['index'], test_input)
        interpreter.invoke()
        interpreter.get_tensor(output_details[0]['index'])
        times.append(time.perf_counter() - start)
    
    print(f"Inference time: {np.mean(times)*1000:.2f} ms")
    
    return {
        'input_shape': input_details[0]['shape'].tolist(),
        'output_shape': output_details[0]['shape'].tolist(),
        'inference_time_ms': float(np.mean(times)*1000),
    }


def save_metadata(output_path: str, metadata: dict, verification: dict):
    """Save model metadata for app integration."""
    labels = metadata.get('labels', [])
    
    app_metadata = {
        'model_format': 'tflite',
        'input_shape': verification['input_shape'],
        'output_shape': verification['output_shape'],
        'num_classes': len(labels),
        'labels': labels,
        'label_to_idx': {l: i for i, l in enumerate(labels)},
        'sample_rate_hz': metadata.get('sample_rate_hz', 100),
        'window_sec': metadata.get('window_sec', 2.5),
        'window_samples': metadata.get('window_samples', 250),
        'norm_mean': metadata.get('norm_mean', [0]*6),
        'norm_std': metadata.get('norm_std', [1]*6),
        'confidence_threshold': CONFIDENCE_THRESHOLD,
        'inference_time_ms': verification['inference_time_ms'],
    }
    
    with open(output_path, 'w') as f:
        json.dump(app_metadata, f, indent=2)
    
    print(f"Saved: {output_path}")


# =============================================================================
# Main
# =============================================================================

def main(quantize: str = None):
    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    
    # Find model
    model_path = BEST_MODEL_PATH if os.path.exists(BEST_MODEL_PATH) else MODEL_PATH
    if not os.path.exists(model_path):
        print(f"Model not found: {model_path}")
        print("Run: python train_classifier.py")
        return
    
    # Load metadata
    metadata = {}
    if os.path.exists(METADATA_PATH):
        with open(METADATA_PATH) as f:
            metadata = json.load(f)
    
    # Export
    suffix = f"_{quantize}" if quantize else ""
    tflite_path = f'{OUTPUT_DIR}/lift_classifier{suffix}.tflite'
    
    export_tflite(model_path, tflite_path, quantize)
    verification = verify_model(tflite_path)
    
    # Save metadata
    metadata_path = f'{OUTPUT_DIR}/lift_classifier{suffix}_metadata.json'
    save_metadata(metadata_path, metadata, verification)
    
    print("\n" + "="*50)
    print("EXPORT COMPLETE")
    print("="*50)
    print(f"TFLite: {tflite_path}")
    print(f"Metadata: {metadata_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--quantize', choices=['float16'], default=None)
    args = parser.parse_args()
    main(args.quantize)