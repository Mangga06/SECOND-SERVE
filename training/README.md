# Second Serve CV training

This is a reproducible training path, not a claim that the shipped classical baseline has trained-food accuracy. Obtain FoodSeg103, UECFoodPixComplete, Nutrition5k, and Food-101 directly from their owners and comply with their licences. Keep raw datasets outside Git.

Create a reviewed custom JSONL manifest with paired `before`/`after` plate images, `plate_id`, `pair_id`, boxes/masks, class labels, reference-scale and plate metadata, served/remaining grams, confidence, and nutrition ground truth where available. Run `python training/prepare_dataset.py --manifest custom.jsonl --output prepared`. It assigns complete plate/pair groups to deterministic 70/15/15 train/val/test splits, preventing leakage.

Map public labels only through `class_mapping.yaml`; `UNMAPPED` labels must be reviewed. Convert verified records into YOLO segmentation format, then run transfer learning followed by fine tuning:

`python training/train.py --data data.yaml --model local-seg.pt --dataset-version custom-v1 --stage transfer`

`python training/train.py --data data.yaml --model runs/second_serve/segmentation/weights/best.pt --dataset-version custom-v1 --stage fine_tune`

The trainer uses augmentation, cosine LR, AdamW, checkpointing and patience-based early stopping. Evaluate only held-out test data with `python training/evaluate.py --data data.yaml --model .../best.pt --output metrics.json`. This writes the observed box/segmentation metrics. Portion/waste/nutrition MAE must be calculated against the manifest's verified grams and nutrition fields before release; missing ground truth is reported as unavailable.
