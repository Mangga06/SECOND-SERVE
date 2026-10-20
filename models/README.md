# Optional food segmentation model

The application works without a downloaded model. The baseline uses OpenCV plate ellipse detection, bounded ORB/RANSAC alignment, contrast segmentation and appearance matching. Baseline regions are explicitly unclassified.

To enable trained recognition:

1. Install `backend/requirements-vision.txt` in the virtual environment.
2. Train and validate an Ultralytics **segmentation** checkpoint on a licensed food dataset representative of your plates, dishes, lighting and camera positions. Generic object-detection weights do not supply reliable Indian food labels.
3. Set `YOLO_MODEL_PATH` to that trusted local checkpoint and restart the server.
4. Check `/api/admin/model` and compare held-out masks/labels with human-reviewed ground truth.

Only a server administrator should configure model paths. The API deliberately does not accept executable model uploads. Recognition quality is unverified until a trained checkpoint and validation dataset are supplied. The UI heuristic quality score is not a model probability.

The integration uses PyTorch through Ultralytics, maps predicted class names, resizes segmentation masks into the normalized plate frame, and retains the conservative before/after area-estimation pipeline. A configured model failure is reported explicitly; results are never silently fabricated.
