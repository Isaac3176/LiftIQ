"""
Train 1D CNN for lift/exercise classification.

Input: ml/data/recgym_processed/windows.npz
Output: ml/models/lift_classifier.h5, ml/reports/lift_classifier_metrics.json

Usage:
    python train_classifier.py
    python train_classifier.py --epochs 100 --batch_size 32
"""

import os
import json
import argparse
import numpy as np
from pathlib import Path

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from sklearn.metrics import classification_report, confusion_matrix, f1_score

# =============================================================================
# Configuration - FIXED PATHS
# =============================================================================

DATA_PATH = 'ml/data/recgym_processed/windows.npz'
METADATA_PATH = 'ml/data/recgym_processed/metadata.json'
MODEL_DIR = 'ml/models'
REPORT_DIR = 'ml/reports'

CONFIDENCE_THRESHOLD = 0.6


# =============================================================================
# Model Architecture
# =============================================================================

def build_model(input_shape: tuple, num_classes: int, dropout: float = 0.3) -> keras.Model:
    """Build 1D CNN for exercise classification."""
    model = keras.Sequential([
        layers.Input(shape=input_shape),
        
        # Conv Block 1
        layers.Conv1D(32, kernel_size=7, padding='same'),
        layers.BatchNormalization(),
        layers.ReLU(),
        layers.MaxPooling1D(pool_size=2),
        layers.Dropout(dropout * 0.5),
        
        # Conv Block 2
        layers.Conv1D(64, kernel_size=5, padding='same'),
        layers.BatchNormalization(),
        layers.ReLU(),
        layers.MaxPooling1D(pool_size=2),
        layers.Dropout(dropout * 0.5),
        
        # Conv Block 3
        layers.Conv1D(128, kernel_size=3, padding='same'),
        layers.BatchNormalization(),
        layers.ReLU(),
        layers.MaxPooling1D(pool_size=2),
        layers.Dropout(dropout),
        
        # Conv Block 4
        layers.Conv1D(128, kernel_size=3, padding='same'),
        layers.BatchNormalization(),
        layers.ReLU(),
        
        # Global pooling + Dense
        layers.GlobalAveragePooling1D(),
        layers.Dense(64),
        layers.BatchNormalization(),
        layers.ReLU(),
        layers.Dropout(dropout),
        layers.Dense(num_classes, activation='softmax')
    ], name='lift_classifier')
    
    return model


def compute_class_weights(y: np.ndarray) -> dict:
    """Compute class weights for imbalanced data."""
    classes = np.unique(y)
    counts = np.bincount(y, minlength=len(classes))
    total = len(y)
    return {int(cls): total / (len(classes) * counts[cls]) for cls in classes}


# =============================================================================
# Training
# =============================================================================

def train(epochs: int = 100, batch_size: int = 32, learning_rate: float = 0.001, dropout: float = 0.3):
    """Main training function."""
    Path(MODEL_DIR).mkdir(parents=True, exist_ok=True)
    Path(REPORT_DIR).mkdir(parents=True, exist_ok=True)
    
    # Load data
    if not os.path.exists(DATA_PATH):
        print(f"Data not found: {DATA_PATH}")
        print("Run: python ml/scripts/preprocess_recgym.py")
        return
    
    print(f"Loading data from {DATA_PATH}...")
    data = np.load(DATA_PATH)
    X_train, y_train = data['X_train'], data['y_train']
    X_val, y_val = data['X_val'], data['y_val']
    X_test, y_test = data['X_test'], data['y_test']
    
    with open(METADATA_PATH) as f:
        metadata = json.load(f)
    
    labels = metadata['labels']
    num_classes = len(labels)
    input_shape = (X_train.shape[1], X_train.shape[2])
    
    print(f"\n{'='*50}")
    print("DATASET")
    print(f"{'='*50}")
    print(f"Train: {len(X_train)} windows")
    print(f"Val:   {len(X_val)} windows")
    print(f"Test:  {len(X_test)} windows")
    print(f"Classes: {num_classes}")
    print(f"Labels: {labels}")
    print(f"Input shape: {input_shape}")
    
    # Build model
    print(f"\n{'='*50}")
    print("MODEL")
    print(f"{'='*50}")
    model = build_model(input_shape, num_classes, dropout)
    model.summary()
    
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=learning_rate),
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy']
    )
    
    # Class weights
    class_weights = compute_class_weights(y_train)
    print(f"\nUsing class weights for {len(class_weights)} classes")
    
    # Callbacks
    callbacks = [
        keras.callbacks.EarlyStopping(
            monitor='val_loss',
            patience=15, 
            restore_best_weights=True,
            verbose=1
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5, 
            patience=7, 
            min_lr=1e-6,
            verbose=1
        ),
        keras.callbacks.ModelCheckpoint(
            f'{MODEL_DIR}/lift_classifier_best.h5', 
            monitor='val_accuracy',
            save_best_only=True,
            verbose=1
        ),
    ]
    
    # Train
    print(f"\n{'='*50}")
    print("TRAINING")
    print(f"{'='*50}")
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=epochs,
        batch_size=batch_size,
        class_weight=class_weights,
        callbacks=callbacks,
        verbose=1
    )
    
    # Save final model
    model.save(f'{MODEL_DIR}/lift_classifier.h5')
    print(f"\nSaved: {MODEL_DIR}/lift_classifier.h5")
    
    # Evaluate
    print(f"\n{'='*50}")
    print("TEST RESULTS")
    print(f"{'='*50}")
    
    y_pred_probs = model.predict(X_test, verbose=0)
    y_pred = y_pred_probs.argmax(axis=1)
    
    test_loss, test_acc = model.evaluate(X_test, y_test, verbose=0)
    print(f"\nTest Loss: {test_loss:.4f}")
    print(f"Test Accuracy: {test_acc:.4f}")
    
    # Classification report
    print("\nClassification Report:")
    all_class_ids = np.arange(num_classes)
    print(
        classification_report(
            y_test,
            y_pred,
            labels=all_class_ids,
            target_names=labels,
            zero_division=0
        )
    )
    
    # Confusion matrix
    cm = confusion_matrix(y_test, y_pred)
    
    # F1 scores
    macro_f1 = f1_score(y_test, y_pred, average='macro', zero_division=0)
    weighted_f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)
    print(f"Macro F1: {macro_f1:.4f}")
    print(f"Weighted F1: {weighted_f1:.4f}")
    
    # Save metrics
    metrics = {
        'test_loss': float(test_loss),
        'test_accuracy': float(test_acc),
        'macro_f1': float(macro_f1),
        'weighted_f1': float(weighted_f1),
        'num_classes': num_classes,
        'labels': labels,
        'confusion_matrix': cm.tolist(),
        'classification_report': classification_report(
            y_test,
            y_pred,
            labels=all_class_ids,
            target_names=labels,
            output_dict=True,
            zero_division=0
        ),
        'epochs_trained': len(history.history['loss']),
        'best_val_accuracy': float(max(history.history['val_accuracy'])),
        'best_val_loss': float(min(history.history['val_loss'])),
        'hyperparameters': {
            'epochs': epochs,
            'batch_size': batch_size,
            'learning_rate': learning_rate,
            'dropout': dropout,
        }
    }
    
    with open(f'{REPORT_DIR}/lift_classifier_metrics.json', 'w') as f:
        json.dump(metrics, f, indent=2)
    
    print(f"\n{'='*50}")
    print("COMPLETE")
    print(f"{'='*50}")
    print(f"Model: {MODEL_DIR}/lift_classifier.h5")
    print(f"Best model: {MODEL_DIR}/lift_classifier_best.h5")
    print(f"Metrics: {REPORT_DIR}/lift_classifier_metrics.json")
    print(f"\nNext step: python ml/scripts/export_tflite.py")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--epochs', type=int, default=100)
    parser.add_argument('--batch_size', type=int, default=32)
    parser.add_argument('--learning_rate', type=float, default=0.001)
    parser.add_argument('--dropout', type=float, default=0.3)
    args = parser.parse_args()
    
    train(args.epochs, args.batch_size, args.learning_rate, args.dropout)
