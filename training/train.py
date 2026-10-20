"""Run staged YOLO segmentation transfer learning; metrics come only from Ultralytics output."""
import argparse, json
from pathlib import Path
from datetime import datetime, timezone

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--data', required=True, help='Reviewed YOLO segmentation data.yaml with train/val/test paths')
    p.add_argument('--model', required=True, help='Local pretrained segmentation checkpoint')
    p.add_argument('--project', default='runs/second_serve')
    p.add_argument('--name', default='segmentation')
    p.add_argument('--epochs', type=int, default=80)
    p.add_argument('--imgsz', type=int, default=640)
    p.add_argument('--batch', type=int, default=8)
    p.add_argument('--dataset-version', required=True)
    p.add_argument('--stage', choices=['transfer', 'fine_tune'], default='transfer')
    args = p.parse_args()
    from ultralytics import YOLO
    freeze = 10 if args.stage == 'transfer' else 0
    model = YOLO(args.model)
    result = model.train(data=args.data, epochs=args.epochs, imgsz=args.imgsz, batch=args.batch, project=args.project, name=args.name, freeze=freeze, patience=15, cos_lr=True, optimizer='AdamW', augment=True, save=True, plots=True)
    run = Path(result.save_dir)
    (run / 'run.json').write_text(json.dumps({'dataset_version': args.dataset_version, 'stage': args.stage, 'timestamp': datetime.now(timezone.utc).isoformat(), 'model': args.model, 'augmentations': 'Ultralytics default segmentation augmentations', 'best_checkpoint': str(run / 'weights' / 'best.pt')}, indent=2), encoding='utf8')
    print(run)
if __name__ == '__main__': main()
