import json

with open('ml/data/recgym_processed/metadata.json') as f:
    src = json.load(f)

with open('ml/models/lift_classifier_metadata.json') as f:
    dst = json.load(f)

dst['labels'] = src['labels']
dst['label_to_idx'] = src['label_to_idx']
dst['label_names'] = src.get('label_names', {})
dst['num_classes'] = src['num_classes']
dst['norm_mean'] = src['norm_mean']
dst['norm_std'] = src['norm_std']

with open('ml/models/lift_classifier_metadata.json', 'w') as f:
    json.dump(dst, f, indent=2)

print("Fixed! 21 classes")