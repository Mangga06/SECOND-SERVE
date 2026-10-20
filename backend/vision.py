"""Conservative classical CV baseline. No pretrained food recognition is implied."""
import os
from functools import lru_cache
from threading import Lock
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageOps

SIZE = 512
MODEL_LOCK = Lock()


@lru_cache(maxsize=1)
def load_model(path):
    from ultralytics import YOLO
    return YOLO(path)


def read_image(path):
    with Image.open(path) as im:
        if im.width * im.height > 24_000_000 or min(im.size) < 128:
            raise ValueError(
                'Use an image at least 128 px wide and tall, up to 24 megapixels.')
        im = ImageOps.exif_transpose(im).convert('RGB')
        im.thumbnail((1600, 1600))
        return cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)


def plate_normalize(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    smooth = cv2.GaussianBlur(gray, (7, 7), 0)
    edges = cv2.Canny(smooth, 35, 100)
    contours, _ = cv2.findContours(
        edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    h, w = gray.shape
    candidates = []
    for c in contours:
        if len(c) < 5:
            continue
        ellipse = cv2.fitEllipse(c)
        (x, y), (a, b), angle = ellipse
        area = np.pi * a * b / 4
        if .2*w*h < area < .96*w*h and min(a, b)/max(a, b) > .50 and abs(x-w/2) < w*.22 and abs(y-h/2) < h*.22:
            fit = abs(cv2.contourArea(c)-area)/max(area, 1)
            if fit < .15:
                candidates.append((area, ellipse))
    detected = bool(candidates)
    if detected:
        _, ((x, y), (a, b), angle) = max(candidates, key=lambda v: v[0])
        rotation = cv2.getRotationMatrix2D((x, y), angle, 1)
        rotated = cv2.warpAffine(
            image, rotation, (w, h), borderMode=cv2.BORDER_REPLICATE)
        crop = cv2.getRectSubPix(
            rotated, (max(1, int(a)), max(1, int(b))), (x, y))
    else:
        side = min(w, h)
        crop = image[(h-side)//2:(h+side)//2, (w-side)//2:(w+side)//2]
    normalized = cv2.resize(crop, (SIZE, SIZE))
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    return normalized, detected, sharpness


def food_mask(image):
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    yy, xx = np.ogrid[:SIZE, :SIZE]
    radius = np.sqrt((xx-256)**2+(yy-256)**2)
    ring = (radius > 205) & (radius < 235)
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB).astype(float)
    bg = np.median(lab[ring], axis=0)
    difference = np.linalg.norm(lab-bg, axis=2)
    mask = (((hsv[:, :, 1] > 42) & (hsv[:, :, 2] > 38) | (difference > 38) & (
        hsv[:, :, 2] < 205)) & (radius < 211)).astype(np.uint8)*255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    return mask


def polygon_mask(polygons):
    mask = np.zeros((SIZE, SIZE), np.uint8)
    for poly in polygons:
        points = np.array([[round(x*SIZE), round(y*SIZE)]
                          for x, y in poly], np.int32)
        cv2.fillPoly(mask, [points], 255)
    return mask


def geometry(mask):
    contours, _ = cv2.findContours(
        mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polygons = []
    for c in contours:
        if cv2.contourArea(c) > 30:
            p = cv2.approxPolyDP(c, 2, True).reshape(-1, 2)
            polygons.append((p/SIZE).round(4).tolist())
    ys, xs = np.where(mask > 0)
    return {'polygons': polygons, 'centroid': [float(xs.mean()/SIZE), float(ys.mean()/SIZE)] if len(xs) else [.5, .5], 'area': int(len(xs))}


def quantities(initial, remaining):
    initial = max(0, float(initial))
    remaining = min(initial, max(0, float(remaining)))
    if not np.isfinite(initial) or not np.isfinite(remaining):
        raise ValueError('Quantities must be finite.')
    return dict(initial_quantity=round(initial, 2), remaining_quantity=round(remaining, 2), consumed_quantity=round(initial-remaining, 2), waste_quantity=round(remaining, 2), waste_percentage=round(remaining/initial*100, 2) if initial else 0)


def overlay(image, masks, mode):
    out = image.copy()
    colors = [(112, 214, 165), (82, 187, 239), (213, 153, 110),
              (162, 122, 217), (120, 209, 217)]
    for i, mask in enumerate(masks):
        color = (65, 104, 235) if mode == 'waste' else colors[i % len(colors)]
        tinted = out.copy()
        tinted[mask > 0] = color
        out = cv2.addWeighted(out, .55, tinted, .45, 0)
        contours, _ = cv2.findContours(
            mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(out, contours, -1, color, 2)
        if mode == 'detection' and np.any(mask):
            x, y, w, h = cv2.boundingRect(mask)
            cv2.rectangle(out, (x, y), (x+w, y+h), color, 2)
            cv2.putText(out, f'Region {i+1}', (x, max(20, y-5)),
                        cv2.FONT_HERSHEY_SIMPLEX, .5, color, 2)
    return out


def pipeline(before_path, after_path, folder, served, stage):
    stage('Scanning plate', 10)
    before, bdet, bs = plate_normalize(read_image(before_path))
    after, adet, ass = plate_normalize(read_image(after_path))
    notes = ['Area-based quantity estimates assume comparable food thickness. Missing food is only inferred consumed. Remaining food is a potential waste estimate, not proof of disposal.']
    if not (bdet and adet):
        notes.append(
            'Plate outline was not reliably detected. Center-crop fallback used; review the plate framing.')
    if min(bs, ass) < 40:
        notes.append('Image blur reduces comparison reliability.')
    stage('Aligning plates', 25)
    alignment = 'Ellipse normalization' if bdet and adet else 'Center-crop normalization (review required)'
    orb = cv2.ORB_create(1500)
    ka, da = orb.detectAndCompute(after, None)
    kb, db = orb.detectAndCompute(before, None)
    if da is not None and db is not None:
        pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(da, db, k=2)
        good = [p[0] for p in pairs if len(
            p) == 2 and p[0].distance < .7*p[1].distance]
        if len(good) >= 12:
            src = np.float32([ka[m.queryIdx].pt for m in good])
            dst = np.float32([kb[m.trainIdx].pt for m in good])
            H, inliers = cv2.findHomography(src, dst, cv2.RANSAC, 3)
            if H is not None and inliers.mean() > .55:
                corners = np.float32(
                    [[[0, 0], [512, 0], [512, 512], [0, 512]]])
                transformed = cv2.perspectiveTransform(corners, H)[0]
                if np.isfinite(transformed).all() and np.max(np.linalg.norm(transformed-corners[0], axis=1)) < 65 and cv2.isContourConvex(transformed):
                    after = cv2.warpPerspective(after, H, (SIZE, SIZE))
                    alignment = 'ORB / RANSAC homography'
    stage('Detecting food', 38)
    bm = food_mask(before)
    am = food_mask(after)
    stage('Segmenting portions', 48)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(bm)
    regions = [(stats[i, cv2.CC_STAT_AREA], (labels == i).astype(np.uint8)*255)
               for i in range(1, count) if stats[i, cv2.CC_STAT_AREA] > 180]
    regions = sorted(regions, key=lambda r: r[0], reverse=True)[:12]
    if not regions:
        raise ValueError(
            'No reliable food regions found. Use a contrasting plain plate, even lighting, or another image.')
    stage('Identifying food', 58)
    names = [f'Unclassified region {i+1}' for i in range(len(regions))]
    model_path = os.getenv('YOLO_MODEL_PATH')
    model_used = False
    if model_path:
        with MODEL_LOCK:
            prediction = load_model(model_path).predict(
                before, verbose=False)[0]
        if prediction.masks is not None:
            regions = []
            names = []
            for mask, cls in zip(prediction.masks.data.cpu().numpy(), prediction.boxes.cls.cpu().numpy()):
                m = (cv2.resize(mask, (SIZE, SIZE)) > .5).astype(np.uint8)*255
                if np.count_nonzero(m) > 180:
                    regions.append((np.count_nonzero(m), m))
                    names.append(str(prediction.names[int(cls)]))
            model_used = True
        if not regions:
            raise ValueError(
                'Configured model did not return usable segmentation regions.')
    if not model_used:
        notes.append(
            'Classical color/contrast segmentation, not trained food recognition. Confirm food labels; pale food and complex plates may be missed.')
    stage('Estimating portions', 66)
    labb = cv2.cvtColor(before, cv2.COLOR_BGR2LAB).astype(float)
    laba = cv2.cvtColor(after, cv2.COLOR_BGR2LAB).astype(float)
    centers = np.array([np.median(labb[m > 0], axis=0) for _, m in regions])
    ys, xs = np.where(am > 0)
    after_masks = [np.zeros_like(am) for _ in regions]
    if len(xs):
        distances = np.linalg.norm(
            laba[ys, xs, None, :]-centers[None, :, :], axis=2)
        matched = distances.argmin(axis=1)
        valid = distances.min(axis=1) < 60
        for i, m in enumerate(after_masks):
            m[ys[(matched == i) & valid], xs[(matched == i) & valid]] = 255
        if np.mean(valid) < .75:
            notes.append(
                'Some remaining food could not be matched by appearance. Manual review is required.')
    stage('Comparing food', 77)
    total_area = sum(a for a, _ in regions)
    confidence = .66 if bdet and adet and min(bs, ass) >= 40 else .35
    rows = []
    for i, (area, mask) in enumerate(regions):
        remain = int(np.count_nonzero(after_masks[i]))
        initial = served*area/total_area
        if remain > area*1.05:
            notes.append(
                f'Region {i+1} appears larger afterward; estimate is capped and needs review.')
        rows.append({'label': names[i], **quantities(initial, initial*min(1, remain/max(area, 1))), 'confidence': confidence,
                    'geometry': {**geometry(mask), 'after_polygons': geometry(after_masks[i])['polygons'], 'remaining_area': remain}})
    stage('Calculating waste', 87)
    folder.mkdir(exist_ok=True, parents=True)
    for name, img in [('before', before), ('after', after), ('segmentation', overlay(before, [m for _, m in regions], 'segmentation')), ('detection', overlay(before, [m for _, m in regions], 'detection')), ('waste', overlay(after, after_masks, 'waste')), ('difference', cv2.applyColorMap(cv2.absdiff(bm, am), cv2.COLORMAP_VIRIDIS))]:
        cv2.imwrite(str(folder/f'{name}.jpg'), img)
    stage('Generating insights', 95)
    return rows, {'notes': list(dict.fromkeys(notes)), 'alignment': alignment, 'method': 'YOLO segmentation + appearance matching' if model_used else 'Classical contrast segmentation + appearance matching', 'calibration': f'{served:g} g user-provided total serving; allocated by segmented area', 'confidence_kind': 'Heuristic quality score, not a calibrated probability', 'plate_detected': bdet and adet, 'source': 'RGB area estimate'}


def demo_images(folder, remaining_scale=.55):
    folder.mkdir(exist_ok=True, parents=True)
    paths = []
    for label, scale in [('before', 1), ('after', remaining_scale)]:
        img = np.full((640, 640, 3), (38, 47, 42), np.uint8)
        cv2.circle(img, (320, 320), 278, (210, 220, 215), -1)
        cv2.circle(img, (320, 320), 253, (242, 245, 239), -1)
        for x, y, r, color in [(250, 230, 72, (55, 164, 218)), (410, 285, 65, (67, 139, 59)), (280, 425, 67, (55, 110, 193))]:
            cv2.circle(img, (x, y), int(r*scale), color, -1)
            for dx, dy in [(-12, 4), (14, -13), (0, 21)]:
                cv2.circle(img, (x+dx, y+dy), 4, tuple(min(255, c+20)
                           for c in color), -1)
        path = folder/f'{label}.jpg'
        cv2.imwrite(str(path), img)
        paths.append(path)
    return paths
