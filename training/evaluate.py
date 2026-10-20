"""Evaluate a held-out test split and save actual detector/segment metrics; never invent values."""
import argparse, json
from pathlib import Path
def main():
    p=argparse.ArgumentParser(); p.add_argument('--data', required=True); p.add_argument('--model', required=True); p.add_argument('--output', type=Path, required=True); args=p.parse_args()
    from ultralytics import YOLO
    result=YOLO(args.model).val(data=args.data, split='test', plots=True)
    metrics={key: float(value) for key, value in result.results_dict.items() if isinstance(value, (float, int))}
    args.output.parent.mkdir(parents=True, exist_ok=True); args.output.write_text(json.dumps({'split':'test','metrics':metrics,'checkpoint':args.model}, indent=2), encoding='utf8')
    print(json.dumps(metrics))
if __name__ == '__main__': main()
