"""Validate a reviewed JSONL manifest and create leakage-safe 70/15/15 splits.

Each record must contain id, plate_id, image_path, image_phase (before|after),
annotations, and metadata. Before/after records sharing pair_id always share a split.
"""
import argparse, hashlib, json
from collections import defaultdict
from pathlib import Path

REQUIRED = {'id', 'plate_id', 'image_path', 'image_phase', 'annotations', 'metadata'}

def bucket(key):
    value = int(hashlib.sha256(key.encode()).hexdigest()[:8], 16) % 100
    return 'train' if value < 70 else 'val' if value < 85 else 'test'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    records = [json.loads(line) for line in args.manifest.read_text(encoding='utf8').splitlines() if line.strip()]
    seen, groups = set(), defaultdict(list)
    for row in records:
        missing = REQUIRED - row.keys()
        if missing or row['image_phase'] not in {'before', 'after'} or row['id'] in seen:
            raise SystemExit(f'Invalid manifest record {row.get("id")}: missing {missing} or invalid phase/id')
        seen.add(row['id'])
        groups[row.get('pair_id') or row['plate_id']].append(row)
    out = {name: [] for name in ('train', 'val', 'test')}
    for group, rows in groups.items():
        split = bucket(group)
        for row in rows:
            row['split'] = split
            out[split].append(row)
    args.output.mkdir(parents=True, exist_ok=True)
    for split, rows in out.items():
        (args.output / f'{split}.jsonl').write_text('\n'.join(json.dumps(row, sort_keys=True) for row in rows) + ('\n' if rows else ''), encoding='utf8')
    print(json.dumps({k: len(v) for k, v in out.items()}))

if __name__ == '__main__': main()
