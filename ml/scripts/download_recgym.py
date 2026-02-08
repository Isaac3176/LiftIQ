"""
Download/Extract Kaggle Gym Workout IMU Dataset.

Dataset: https://www.kaggle.com/datasets/... (Gym Workout IMU Dataset)
Sensor: Apple Watch SE (left wrist), 100 Hz

Since Kaggle requires authentication, this script expects you to:
1. Download the dataset manually from Kaggle
2. Place the zip file in ml/data/gym_imu_raw/

Usage:
    python download_recgym.py

This will extract the CSV files from the zip.
"""

import os
import zipfile
from pathlib import Path

# =============================================================================
# Configuration
# =============================================================================

DATA_DIR = "ml/data/recgym_raw"
POSSIBLE_ZIP_NAMES = [
    "archive.zip",
    "gym-workout-imu-dataset.zip", 
    "gym_workout_imu.zip",
    "dataset.zip",
]

# =============================================================================
# Main
# =============================================================================

def find_zip_file(data_dir: str) -> str:
    """Find any zip file in the data directory."""
    data_path = Path(data_dir)
    
    # Check for known zip names
    for name in POSSIBLE_ZIP_NAMES:
        zip_path = data_path / name
        if zip_path.exists():
            return str(zip_path)
    
    # Check for any zip file
    zip_files = list(data_path.glob("*.zip"))
    if zip_files:
        return str(zip_files[0])
    
    return None


def extract_dataset():
    """Extract the dataset from zip file."""
    os.makedirs(DATA_DIR, exist_ok=True)
    
    # Check if CSV files already exist
    csv_files = list(Path(DATA_DIR).glob("**/*.csv"))
    if len(csv_files) > 10:
        print(f"Dataset already extracted: {len(csv_files)} CSV files found")
        print(f"Location: {DATA_DIR}")
        return True
    
    # Find zip file
    zip_path = find_zip_file(DATA_DIR)
    
    if zip_path is None:
        print("="*60)
        print("DATASET NOT FOUND")
        print("="*60)
        print()
        print("Please download the Kaggle Gym Workout IMU Dataset:")
        print()
        print("1. Go to Kaggle and download the dataset")
        print("2. Place the downloaded zip file in:")
        print(f"   {os.path.abspath(DATA_DIR)}/")
        print()
        print("3. Run this script again:")
        print("   python download_recgym.py")
        print()
        print("="*60)
        return False
    
    print(f"Found zip file: {zip_path}")
    print("Extracting...")
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            # List contents
            file_list = zip_ref.namelist()
            csv_count = sum(1 for f in file_list if f.endswith('.csv'))
            print(f"  Found {csv_count} CSV files in archive")
            
            # Extract
            zip_ref.extractall(DATA_DIR)
        
        print("Extraction complete!")
        
        # Verify
        csv_files = list(Path(DATA_DIR).glob("**/*.csv"))
        print(f"  Extracted {len(csv_files)} CSV files")
        
        # Show sample files
        print("\nSample files:")
        for f in csv_files[:5]:
            print(f"  {f.name}")
        if len(csv_files) > 5:
            print(f"  ... and {len(csv_files) - 5} more")
        
        return True
        
    except zipfile.BadZipFile:
        print(f"Error: {zip_path} is not a valid zip file")
        return False
    except Exception as e:
        print(f"Error extracting: {e}")
        return False


def show_dataset_info():
    """Show information about the extracted dataset."""
    csv_files = list(Path(DATA_DIR).glob("**/*.csv"))
    
    if not csv_files:
        return
    
    print("\n" + "="*60)
    print("DATASET INFO")
    print("="*60)
    
    # Parse filenames to extract exercise codes
    from collections import Counter
    exercise_codes = []
    
    for f in csv_files:
        parts = f.stem.split('_')
        if len(parts) >= 2:
            exercise_codes.append(parts[1])
    
    if exercise_codes:
        code_counts = Counter(exercise_codes)
        print(f"\nExercise codes found ({len(code_counts)} unique):")
        for code, count in sorted(code_counts.items(), key=lambda x: -x[1]):
            print(f"  {code}: {count} recordings")
    
    print(f"\nTotal recordings: {len(csv_files)}")
    print(f"\nNext step: python preprocess_recgym.py")


# =============================================================================
# Entry Point
# =============================================================================

if __name__ == "__main__":
    success = extract_dataset()
    if success:
        show_dataset_info()