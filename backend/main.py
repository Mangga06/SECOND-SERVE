from fastapi.staticfiles import StaticFiles
from pathlib import Path
import csv
import io
import os
import uuid
import hashlib
import secrets
import logging
import smtplib
import time
from collections import defaultdict, deque
from datetime import date, datetime, timedelta, timezone
from contextlib import asynccontextmanager
from email.message import EmailMessage
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, BackgroundTasks, Request, Response, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, delete, func
from sqlalchemy.exc import IntegrityError
from PIL import Image, ImageOps, UnidentifiedImageError
from .db import Base, engine, Session, DATA, get_db
from .models import *
from .schemas import *
from .security import current_user, admin, superadmin, passwords, DUMMY, token, public_user, ROLES
from .services import *
from .vision import pipeline, demo_images, quantities, polygon_mask, geometry, overlay, read_image
import cv2
import numpy as np

log = logging.getLogger('secondserve')
ORIGINS = os.getenv(
    'ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000').split(',')


@asynccontextmanager
async def lifespan(app):
    # Schema changes are managed by Alembic; startup only recovers interrupted jobs.
    with Session() as db:
        for role in ROLES:
            if not db.get(Role, role):
                db.add(Role(id=role))
        for m in db.scalars(select(MealAnalysis).where(MealAnalysis.status.in_(['queued', 'processing']))):
            m.status = 'failed'
            m.error = 'Processing was interrupted by a server restart. Please submit the images again.'
        db.commit()
    yield

app = FastAPI(title='Second Serve', version='1.0.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_credentials=True, allow_methods=[
                   'GET', 'POST', 'PUT', 'DELETE'], allow_headers=['Content-Type'])
attempts = defaultdict(deque)


@app.middleware('http')
async def safeguards(request, call_next):
    if request.method not in ['GET', 'HEAD', 'OPTIONS']:
        origin = request.headers.get('origin')
        if origin and origin not in ORIGINS:
            return JSONResponse({'detail': 'Request origin is not allowed.'}, 403)
        if request.headers.get('sec-fetch-site') == 'cross-site':
            return JSONResponse({'detail': 'Cross-site request rejected.'}, 403)
    if request.url.path.startswith('/api/auth/') and request.method == 'POST':
        key = (request.client.host, request.url.path)
        bucket = attempts[key]
        clock = time.monotonic()
        while bucket and bucket[0] < clock-60:
            bucket.popleft()
        if len(bucket) >= 15:
            return JSONResponse({'detail': 'Too many attempts. Wait a minute and try again.'}, 429)
        bucket.append(clock)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'same-origin'
    response.headers['X-Frame-Options'] = 'DENY'
    if request.url.path.startswith('/api'):
        response.headers['Cache-Control'] = 'no-store'
    return response


@app.exception_handler(Exception)
async def unexpected(request, exc):
    log.exception('Request failed', exc_info=exc)
    return JSONResponse({'detail': 'The request could not be completed. Please try again.'}, 500)


def session_cookie(response, user, remember=False):
    response.set_cookie('session', token(user, remember), httponly=True, samesite='lax', secure=os.getenv(
        'COOKIE_SECURE', 'false').lower() == 'true', max_age=604800 if remember else None, path='/')


@app.get('/api/health')
def health(): return {'status': 'ok', 'vision': 'YOLO segmentation' if os.getenv(
    'YOLO_MODEL_PATH') else 'classical segmentation; labels require review'}


@app.post('/api/auth/register', status_code=201)
def register(body: Register, response: Response, db=Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(409, 'This email is already registered.')
    org = Organization(name=body.organization)
    db.add(org)
    db.flush()
    seed_org(db, org)
    user = User(name=body.name, email=body.email, password_hash=passwords.hash(
        body.password), organization_id=org.id, role='USER')
    db.add(user)
    db.flush()
    audit(db, user, 'auth.register')
    db.commit()
    session_cookie(response, user)
    return public_user(user)


@app.post('/api/auth/login')
def login(body: Login, response: Response, db=Depends(get_db)):
    user = db.scalar(select(User).where(
        User.email == body.email.strip().lower()))
    valid = passwords.verify(
        body.password, user.password_hash if user else DUMMY)
    if not user or not valid:
        raise HTTPException(401, 'Email or password is incorrect.')
    audit(db, user, 'auth.login')
    db.commit()
    session_cookie(response, user, body.remember)
    return public_user(user)


@app.get('/api/auth/me')
def me(user=Depends(current_user)): return public_user(user)


@app.post('/api/auth/logout')
def logout(response: Response, user=Depends(current_user), db=Depends(get_db)):
    user.token_version += 1
    db.commit()
    response.delete_cookie('session')
    return {'ok': True}


@app.post('/api/auth/forgot-password')
def forgot(body: ResetRequest, db=Depends(get_db)):
    user = db.scalar(select(User).where(
        User.email == body.email.strip().lower()))
    if user:
        raw = secrets.token_urlsafe(32)
        digest = hashlib.sha256(raw.encode()).hexdigest()
        db.add(PasswordReset(id=digest, user_id=user.id,
               expires_at=now()+timedelta(minutes=30)))
        db.commit()
        url = os.getenv('APP_URL', 'http://localhost:5173') + \
            '/reset-password?token='+raw
        if os.getenv('SMTP_HOST'):
            msg = EmailMessage()
            msg['Subject'] = 'Reset your Second Serve password'
            msg['From'] = os.getenv('SMTP_FROM', 'secondserve@localhost')
            msg['To'] = user.email
            msg.set_content(f'Reset your password within 30 minutes: {url}')
            with smtplib.SMTP(os.environ['SMTP_HOST'], int(os.getenv('SMTP_PORT', '587'))) as smtp:
                smtp.starttls()
                if os.getenv('SMTP_USER'):
                    smtp.login(os.environ['SMTP_USER'],
                               os.environ['SMTP_PASSWORD'])
                smtp.send_message(msg)
        else:
            # Local-only developer delivery. Never return a reset token through the API.
            outbox = DATA/'mail'
            outbox.mkdir(exist_ok=True)
            (outbox/f'{uuid.uuid4()}.txt').write_text(
                f'To: {user.email}\nReset link (30 minutes): {url}', encoding='utf-8')
    return {'message': 'If this account exists, a reset link has been sent. Local installations without SMTP deliver to data/mail.'}


@app.post('/api/auth/reset-password')
def reset(body: ResetPassword, db=Depends(get_db)):
    reset = db.get(PasswordReset, hashlib.sha256(
        body.token.encode()).hexdigest())
    if not reset or reset.used or reset.expires_at.replace(tzinfo=timezone.utc) < now():
        raise HTTPException(400, 'This reset link is invalid or expired.')
    user = db.get(User, reset.user_id)
    user.password_hash = passwords.hash(body.password)
    user.token_version += 1
    reset.used = True
    audit(db, user, 'auth.password_reset')
    db.commit()
    return {'message': 'Password updated. Please sign in.'}


@app.post('/api/analyze/upload', status_code=201)
async def upload(file: UploadFile = File(...), user=Depends(current_user), db=Depends(get_db)):
    raw = await file.read(10*1024*1024+1)
    if len(raw) > 10*1024*1024:
        raise HTTPException(413, 'Images must be 10 MB or smaller.')
    try:
        with Image.open(io.BytesIO(raw)) as original:
            if original.format not in ['JPEG', 'PNG', 'WEBP']:
                raise ValueError()
            if min(original.size) < 128 or original.width*original.height > 24_000_000:
                raise ValueError()
            original.load()
            im = ImageOps.exif_transpose(original).convert('RGB')
            im.thumbnail((1600, 1600))
            id = str(uuid.uuid4())
            path = DATA/'images'/f'{id}.jpg'
            im.save(path, quality=92)
    except (UnidentifiedImageError, ValueError, OSError, Image.DecompressionBombError):
        raise HTTPException(
            400, 'Use a valid JPEG, PNG or WebP, 128 px minimum and 24 megapixels maximum.')
    db.add(Upload(id=id, user_id=user.id, path=str(path)))
    db.commit()
    return {'id': id}


def process(id, grams):
    with Session() as db:
        meal = db.get(MealAnalysis, id)

        def stage(name, progress):
            meal.status = 'processing'
            meal.stage = name
            meal.progress = progress
            db.commit()
        try:
            rows, details = pipeline(
                meal.before_image, meal.after_image, DATA/'images'/id, grams, stage)
            for row in rows:
                meal.foods.append(FoodAnalysis(**row))
            meal.details = {**details, 'model': {
                'name': os.path.basename(os.getenv('YOLO_MODEL_PATH', 'second-serve-classical-baseline')),
                'version': os.getenv('MODEL_VERSION', 'classical-v1'),
                'dataset_version': os.getenv('TRAINING_DATASET_VERSION', 'not-trained'),
                'preprocessing_version': 'plate-normalization-v1',
                'inference_timestamp': now().isoformat(),
            }}
            recalculate(meal)
            meal.status = 'complete'
            meal.stage = 'Ready for review'
            meal.progress = 100
            db.commit()
        except Exception as exc:
            db.rollback()
            meal = db.get(MealAnalysis, id)
            meal.status = 'failed'
            meal.error = str(exc) if isinstance(
                exc, ValueError) else 'Image processing failed. Check the images and model configuration, then try again.'
            db.commit()
            log.exception('CV failed')


@app.post('/api/analyze/meal', status_code=202)
def analyze(body: Analyze, tasks: BackgroundTasks, user=Depends(current_user), db=Depends(get_db)):
    images = [db.get(Upload, id) for id in [body.before_id, body.after_id]]
    if any(not image or image.user_id != user.id for image in images):
        raise HTTPException(400, 'Upload both images from your account first.')
    if body.before_id == body.after_id:
        raise HTTPException(400, 'Select a separate before and after image.')
    if user.role == 'CAFETERIA_MANAGER' and user.cafeteria_id and not body.location_id:
        location = db.scalar(select(Location).where(
            Location.cafeteria_id == user.cafeteria_id, Location.organization_id == user.organization_id))
        if not location:
            raise HTTPException(
                400, 'Your cafeteria needs a location before analyzing meals.')
        body.location_id = location.id
    if body.location_id:
        location = db.get(Location, body.location_id)
        if not location or location.organization_id != user.organization_id or (user.role == 'CAFETERIA_MANAGER' and user.cafeteria_id != location.cafeteria_id):
            raise HTTPException(
                403, 'Location is outside your workspace or cafeteria.')
    active = list(db.scalars(select(MealAnalysis).where(
        MealAnalysis.user_id == user.id, MealAnalysis.status.in_(['queued', 'processing']))))
    if len(active) >= 2:
        raise HTTPException(429, 'Wait for your current analyses to finish.')
    meal = MealAnalysis(id=str(uuid.uuid4()), user_id=user.id, organization_id=user.organization_id,
                        location_id=body.location_id, meal_type=body.meal_type, before_image=images[0].path, after_image=images[1].path)
    db.add(meal)
    audit(db, user, 'analysis.create', {'id': meal.id})
    db.commit()
    tasks.add_task(process, meal.id, body.served_grams)
    return meal_dict(meal)


@app.post('/api/analyze/demo', status_code=202)
def demo(tasks: BackgroundTasks, user=Depends(current_user), db=Depends(get_db)):
    active = list(db.scalars(select(MealAnalysis).where(
        MealAnalysis.user_id == user.id, MealAnalysis.status.in_(['queued', 'processing']))))
    if len(active) >= 2:
        raise HTTPException(429, 'Wait for your current analyses to finish.')
    id = str(uuid.uuid4())
    before, after = demo_images(DATA/'images'/id/'source')
    location = db.scalar(select(Location).where(Location.cafeteria_id == user.cafeteria_id,
                         Location.organization_id == user.organization_id)) if user.cafeteria_id else None
    meal = MealAnalysis(id=id, user_id=user.id, organization_id=user.organization_id, location_id=location.id if location else None,
                        meal_type='Lunch', before_image=str(before), after_image=str(after), demo=True)
    db.add(meal)
    db.commit()
    tasks.add_task(process, id, 500)
    return meal_dict(meal)


@app.get('/api/analysis/{id}')
def analysis(id: str, user=Depends(current_user), db=Depends(get_db)):
    meal = get_meal(db, user, id)
    result = meal_dict(meal, True)
    result['corrections'] = [{'id': c.id, 'reason': c.reason, 'created_at': c.created_at} for c in db.scalars(
        select(Correction).where(Correction.meal_analysis_id == id).order_by(Correction.created_at.desc()))]
    return result


@app.get('/api/analysis/{id}/image/{kind}')
def analysis_image(id: str, kind: str, user=Depends(current_user), db=Depends(get_db)):
    meal = get_meal(db, user, id)
    if kind not in ['before', 'after', 'segmentation', 'detection', 'difference', 'waste']:
        raise HTTPException(404)
    path = DATA/'images'/meal.id/f'{kind}.jpg'
    if not path.exists():
        raise HTTPException(404, 'Image is not available yet.')
    return FileResponse(path, media_type='image/jpeg')


@app.post('/api/analysis/{id}/save')
def save(id: str, user=Depends(current_user), db=Depends(get_db)):
    meal = get_meal(db, user, id)
    if meal.status != 'complete':
        raise HTTPException(409, 'Wait for processing to finish.')
    if not meal.saved:
        meal.saved = True
        create_alerts(db, meal, db.get(User, meal.user_id))
        audit(db, user, 'analysis.save', {'id': id})
        db.commit()
    return meal_dict(meal, True)


@app.post('/api/feedback/correction')
def correct(body: CorrectionInput, user=Depends(current_user), db=Depends(get_db)):
    meal = get_meal(db, user, body.analysis_id)
    if meal.status != 'complete':
        raise HTTPException(409, 'Wait for processing to finish.')
    before = {'foods': [food_dict(f)
                        for f in meal.foods], 'verified': meal.verified}
    replacements = []
    for item in body.foods:
        if item.remaining_quantity > item.initial_quantity:
            raise HTTPException(
                422, 'Remaining quantity cannot exceed initial quantity.')
        food = db.get(Food, item.food_id) if item.food_id else None
        if item.food_id and (not food or food.organization_id != meal.organization_id):
            raise HTTPException(403, 'Food belongs to a different workspace.')
        geom = item.geometry.copy()
        geom['impact_factors'] = food.impact_factor if food else {}
        if geom.get('polygons'):
            geom.update(geometry(polygon_mask(geom['polygons'])))
        replacement = FoodAnalysis(food_id=item.food_id, label=food.name if food else item.label, **quantities(item.initial_quantity,
                                                                                                               item.remaining_quantity), confidence=item.confidence, geometry=geom, cost_per_kg=food.cost_per_kg if food else 0)
        refresh_food_nutrition(db, replacement)
        replacements.append(replacement)
    meal.foods[:] = replacements
    meal.verified = body.verified
    recalculate(meal)
    db.add(Correction(meal_analysis_id=meal.id, user_id=user.id, before=before, after={
           'foods': [food_dict(f) for f in meal.foods], 'verified': meal.verified}, reason=body.reason))
    audit(db, user, 'analysis.correct', {'id': meal.id})
    if meal.saved:
        db.execute(delete(Alert).where(Alert.meal_analysis_id == meal.id))
        create_alerts(db, meal, db.get(User, meal.user_id))
    db.commit()
    folder = DATA/'images'/meal.id
    for kind, base, key in [('segmentation', 'before', 'polygons'), ('detection', 'before', 'polygons'), ('waste', 'after', 'after_polygons')]:
        img = cv2.imread(str(folder/f'{base}.jpg'))
        masks = [polygon_mask(f.geometry.get(key, [])) for f in meal.foods]
        cv2.imwrite(str(folder/f'{kind}.jpg'), overlay(img, masks, kind))
    initial = np.zeros((512, 512), np.uint8)
    remaining = initial.copy()
    for f in meal.foods:
        initial = cv2.bitwise_or(initial, polygon_mask(
            f.geometry.get('polygons', [])))
        remaining = cv2.bitwise_or(remaining, polygon_mask(
            f.geometry.get('after_polygons', [])))
    cv2.imwrite(str(folder/'difference.jpg'),
                cv2.applyColorMap(cv2.absdiff(initial, remaining), cv2.COLORMAP_VIRIDIS))
    return meal_dict(meal, True)


@app.get('/api/history')
def history(start: date | None = None, end: date | None = None, meal_type: str | None = None, location_id: int | None = None, food: str = '', search: str = '', min_waste: float = Query(0, ge=0, le=100), confidence: float = Query(0, ge=0, le=1), sort: Literal['newest', 'oldest', 'waste'] = 'newest', page: int = Query(1, ge=1), user=Depends(current_user), db=Depends(get_db)):
    q = scope(db, user)
    if start:
        q = q.where(MealAnalysis.created_at >=
                    datetime.combine(start, datetime.min.time()))
    if end:
        q = q.where(MealAnalysis.created_at < datetime.combine(
            end+timedelta(days=1), datetime.min.time()))
    if meal_type:
        q = q.where(MealAnalysis.meal_type == meal_type)
    if location_id:
        q = q.where(MealAnalysis.location_id == location_id)
    q = q.where(MealAnalysis.waste_percentage >= min_waste,
                MealAnalysis.confidence >= confidence)
    if food or search:
        q = q.where(MealAnalysis.foods.any(
            FoodAnalysis.label.ilike(f'%{food or search}%')))
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = list(db.scalars(q.order_by(MealAnalysis.waste_percentage.desc() if sort == 'waste' else MealAnalysis.created_at.asc(
    ) if sort == 'oldest' else MealAnalysis.created_at.desc()).offset((page-1)*12).limit(12)))
    return {'items': [meal_dict(m) for m in rows], 'total': total, 'page': page, 'pages': max(1, (total+11)//12)}


def data_for(db, user, start, end, include_demo, period='daily'):
    if start and end and start > end:
        raise HTTPException(422, 'Start date must precede end date.')
    result = analytics(db, user, filtered(
        db, user, start, end, include_demo), period)
    if start and end and (end-start).days < 366:
        duration = (end-start).days+1
        previous = analytics(db, user, filtered(
            db, user, start-timedelta(days=duration), start-timedelta(days=1), include_demo), period)
        result['previous_overview'] = previous['overview']
        previous_by_name = {r['name']: r['waste_percentage']
                            for r in previous['trends']}
        for row in result['trends']:
            if period == 'daily':
                previous_date = (date.fromisoformat(
                    row['name'])-timedelta(days=duration)).isoformat()
                row['previous_waste_percentage'] = previous_by_name.get(
                    previous_date)
    return result


@app.get('/api/analytics/{kind}')
def analytical(kind: str, start: date | None = None, end: date | None = None, include_demo: bool = False, period: Literal['daily', 'weekly', 'monthly'] = 'daily', user=Depends(current_user), db=Depends(get_db)):
    data = data_for(db, user, start, end, include_demo, period)
    key = {'food-waste': 'foods', 'meal-time': 'meal_time'}.get(kind, kind)
    if kind == 'all':
        return data
    if key not in data:
        raise HTTPException(404)
    return data[key]


@app.get('/api/insights')
def insights(user=Depends(current_user), db=Depends(get_db)):
    data = data_for(db, user, None, None, False)
    return {k: data[k] for k in ['insights', 'recommendations']}


@app.get('/api/reports/export')
def export(format: Literal['csv', 'json', 'pdf'] = 'csv', start: date | None = None, end: date | None = None, include_demo: bool = False, user=Depends(current_user), db=Depends(get_db)):
    data = data_for(db, user, start, end, include_demo)
    meals = filtered(db, user, start, end, include_demo)
    db.add(Report(user_id=user.id, format=format, filters={
           'start': str(start), 'end': str(end), 'include_demo': include_demo}))
    audit(db, user, 'report.export', {'format': format})
    db.commit()
    headers = {
        'Content-Disposition': f'attachment; filename="second-serve-report.{format}"'}
    if format == 'json':
        return JSONResponse({**data, 'meals': [{**meal_dict(m, True), 'created_at': m.created_at.isoformat()} for m in meals]}, headers=headers)
    if format == 'csv':
        buf = io.StringIO()
        writer = csv.writer(buf)

        def write_row(values):
            writer.writerow(["'"+v if isinstance(v, str) and v.lstrip(
            ).startswith(('=', '+', '-', '@')) else v for v in values])
        write_row(['Analysis', 'Date', 'Meal', 'Demo', 'Verified', 'Estimated served g',
                  'Estimated consumed g', 'Estimated remaining/waste g', 'Waste %', 'Estimated value INR'])
        for m in meals:
            write_row([m.id, m.created_at.isoformat(), m.meal_type, m.demo, m.verified,
                      m.total_served, m.total_consumed, m.total_waste, m.waste_percentage, m.cost_wasted])
        write_row([])
        write_row(['Food', 'Served g', 'Wasted g', 'Waste %', 'Cost INR'])
        for f in data['foods']:
            write_row([("'"+f['name']) if f['name'].startswith(('=', '+', '-', '@'))
                      else f['name'], f['served'], f['wasted'], f['waste_percentage'], f['cost']])
        for text in data['insights']:
            write_row(['Insight', text])
        for r in data['recommendations']:
            write_row(['Experimental recommendation', r['food'],
                      r['low'], r['high'], r['label']])
        return Response(buf.getvalue(), media_type='text/csv', headers=headers)
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    from xml.sax.saxutils import escape
    buf = io.BytesIO()
    styles = getSampleStyleSheet()
    story = [Paragraph('SECOND SERVE', styles['Title']), Paragraph('Giving Every Plate a Second Chance', styles['Normal']), Spacer(
        1, 18), Paragraph(f'Report: {start or "all time"} to {end or "today"}', styles['Heading2'])]
    story.append(Paragraph('All quantities and costs are estimates. Remaining food is potential waste; missing food is inferred consumed. Demo data included: ' +
                 str(include_demo), styles['Normal']))
    for key, value in data['overview'].items():
        story.append(Paragraph(
            escape(f'{key.replace("_", " ").title()}: {value}'), styles['Normal']))
    story.append(Spacer(1, 16))
    table = Table([['Food', 'Served g', 'Wasted g', 'Waste %']]+[[Paragraph(escape(f['name']), styles['Normal']),
                  f"{f['served']:.0f}", f"{f['wasted']:.0f}", f"{f['waste_percentage']:.1f}"] for f in data['foods']], colWidths=[240, 80, 80, 80], repeatRows=1)
    table.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0),
                   colors.HexColor('#d8edc9')), ('BOTTOMPADDING', (0, 0), (-1, -1), 9)]))
    story.append(table)
    for insight in data['insights']:
        story.extend([Spacer(1, 12), Paragraph(
            escape(insight), styles['Normal'])])
    for r in data['recommendations']:
        story.append(Paragraph(escape(
            f"{r['food']}: test {r['low']}–{r['high']} g. {r['label']}"), styles['Normal']))
    SimpleDocTemplate(buf).build(story)
    return Response(buf.getvalue(), media_type='application/pdf', headers=headers)


@app.get('/api/reports/{period}')
def reports(period: Literal['daily', 'weekly', 'monthly'], user=Depends(current_user), db=Depends(get_db)):
    days = {'daily': 1, 'weekly': 7, 'monthly': 30}[period]
    today = now().date()
    return data_for(db, user, today-timedelta(days=days-1), today, False)


@app.get('/api/foods')
def foods(user=Depends(current_user), db=Depends(get_db)):
    return list(db.scalars(select(Food).where(Food.organization_id == user.organization_id, Food.active == True).order_by(Food.name)))


def update_food(db, food, body, user):
    for key, value in body.model_dump().items():
        setattr(food, key, value)
    db.flush()
    db.add(PortionConfig(food_id=food.id, grams=food.standard_portion,
           source='Administrator configuration'))
    db.add(FoodCost(food_id=food.id, value=food.cost_per_kg))
    db.add(ImpactFactor(food_id=food.id, values=food.impact_factor))
    if food.nutrition_per_100g and food.nutrition_source:
        food.nutrition_updated_at = now()
        db.add(NutritionHistory(food_id=food.id, values_per_100g=food.nutrition_per_100g,
               source=food.nutrition_source, source_version=food.nutrition_source_version or 'unversioned', changed_by_user_id=user.id))
    audit(db, user, 'food.configure', {'id': food.id})
    db.commit()
    return food


@app.post('/api/foods', status_code=201)
def add_food(body: FoodInput, user=Depends(admin), db=Depends(get_db)):
    food = Food(organization_id=user.organization_id, **body.model_dump())
    db.add(food)
    return update_food(db, food, body, user)


@app.put('/api/foods/{id}')
def edit_food(id: int, body: FoodInput, user=Depends(admin), db=Depends(get_db)):
    food = db.get(Food, id)
    if not food or food.organization_id != user.organization_id:
        raise HTTPException(404)
    return update_food(db, food, body, user)


@app.delete('/api/foods/{id}')
def delete_food(id: int, user=Depends(admin), db=Depends(get_db)):
    food = db.get(Food, id)
    if not food or food.organization_id != user.organization_id:
        raise HTTPException(404)
    food.active = False
    audit(db, user, 'food.archive', {'id': id})
    db.commit()
    return {'ok': True}


@app.get('/api/foods/{id}/nutrition')
def food_nutrition(id: int, user=Depends(current_user), db=Depends(get_db)):
    food = db.get(Food, id)
    if not food or food.organization_id != user.organization_id:
        raise HTTPException(404, 'Food not found.')
    return {'food_id': food.id, 'name': food.name, 'per_100g': food.nutrition_per_100g,
            'source': food.nutrition_source, 'source_version': food.nutrition_source_version,
            'updated_at': food.nutrition_updated_at}


@app.put('/api/admin/foods/{id}/nutrition')
def configure_food_nutrition(id: int, body: NutritionInput, user=Depends(admin), db=Depends(get_db)):
    food = db.get(Food, id)
    if not food or food.organization_id != user.organization_id:
        raise HTTPException(404, 'Food not found.')
    food.nutrition_per_100g = body.nutrition_per_100g
    food.nutrition_source = body.nutrition_source
    food.nutrition_source_version = body.nutrition_source_version
    food.nutrition_updated_at = now()
    db.add(NutritionHistory(food_id=food.id, values_per_100g=body.nutrition_per_100g,
           source=body.nutrition_source, source_version=body.nutrition_source_version, changed_by_user_id=user.id))
    audit(db, user, 'food.nutrition.configure', {
          'id': food.id, 'source_version': body.nutrition_source_version})
    db.commit()
    return food_nutrition(id, user, db)


@app.get('/api/fit/profile')
def fit_profile(user=Depends(current_user), db=Depends(get_db)):
    profile = db.scalar(select(FitnessProfile).where(
        FitnessProfile.user_id == user.id))
    return profile or {'age': None, 'height_cm': None, 'weight_kg': None, 'activity_level': None, 'fitness_goal': None}


@app.put('/api/fit/profile')
@app.post('/api/fit/profile')
def save_fit_profile(body: FitnessProfileInput, user=Depends(current_user), db=Depends(get_db)):
    profile = db.scalar(select(FitnessProfile).where(
        FitnessProfile.user_id == user.id))
    if not profile:
        profile = FitnessProfile(user_id=user.id)
        db.add(profile)
    for key, value in body.model_dump().items():
        setattr(profile, key, value)
    audit(db, user, 'fit.profile.update')
    db.commit()
    return profile


def fit_data(db, user, days, include_demo):
    start = now().date() - timedelta(days=days - 1)
    meals = filtered(db, user, start, now().date(), include_demo)
    nutrition = nutrition_summary(meals)
    waste = summarize(meals)
    return meals, nutrition, waste


@app.get('/api/fit/overview')
def fit_overview(days: int = Query(30, ge=1, le=365), include_demo: bool = False, user=Depends(current_user), db=Depends(get_db)):
    meals, nutrition, waste = fit_data(db, user, days, include_demo)
    score = round(
        max(0, 100 - waste['waste_percentage']), 1) if meals else None
    return {'days': days, 'meal_count': len(meals), 'nutrition': nutrition, 'waste': waste,
            'food_waste_score': score, 'score_method': '100 minus estimated plate-waste percentage; displayed only when recorded meals exist.',
            'disclaimer': 'Nutrition and quantities are estimates from configured food data and image analysis. They are not medical advice.'}


@app.get('/api/fit/bmi')
def fit_bmi(user=Depends(current_user), db=Depends(get_db)):
    profile = db.scalar(select(FitnessProfile).where(
        FitnessProfile.user_id == user.id))
    if not profile or not profile.height_cm or not profile.weight_kg:
        return {'value': None, 'category': None, 'disclaimer': 'Add height and weight to calculate BMI. BMI is a screening measure, not medical advice.'}
    value = profile.weight_kg / (profile.height_cm / 100) ** 2
    category = 'Underweight' if value < 18.5 else 'Healthy range' if value < 25 else 'Overweight' if value < 30 else 'Obesity range'
    return {'value': round(value, 1), 'category': category, 'disclaimer': 'BMI uses weight divided by height squared. It is a screening measure, not medical advice.'}


@app.get('/api/fit/nutrition')
@app.get('/api/fit/trends')
@app.get('/api/fit/food-breakdown')
def fit_nutrition(days: int = Query(30, ge=1, le=365), include_demo: bool = False, user=Depends(current_user), db=Depends(get_db)):
    _, nutrition, _ = fit_data(db, user, days, include_demo)
    return nutrition


@app.get('/api/locations')
def locations(user=Depends(current_user), db=Depends(get_db)):
    q = select(Location).where(
        Location.organization_id == user.organization_id)
    if user.role == 'CAFETERIA_MANAGER':
        q = q.where(Location.cafeteria_id == user.cafeteria_id)
    return list(db.scalars(q))


@app.post('/api/locations', status_code=201)
def add_location(body: PlaceInput, user=Depends(admin), db=Depends(get_db)):
    if body.cafeteria_id:
        cafe = db.get(Cafeteria, body.cafeteria_id)
        if not cafe or cafe.organization_id != user.organization_id:
            raise HTTPException(403)
    location = Location(
        organization_id=user.organization_id, **body.model_dump())
    db.add(location)
    audit(db, user, 'location.create')
    db.commit()
    return location


@app.get('/api/cafeterias')
def cafeterias(user=Depends(current_user), db=Depends(get_db)):
    return list(db.scalars(select(Cafeteria).where(Cafeteria.organization_id == user.organization_id)))


@app.post('/api/cafeterias', status_code=201)
def add_cafeteria(body: PlaceInput, user=Depends(admin), db=Depends(get_db)):
    cafe = Cafeteria(organization_id=user.organization_id, name=body.name)
    db.add(cafe)
    audit(db, user, 'cafeteria.create')
    db.commit()
    return cafe


@app.get('/api/alerts')
def alerts(user=Depends(current_user), db=Depends(get_db)):
    ids = scope(db, user).with_only_columns(MealAnalysis.id)
    return list(db.scalars(select(Alert).where(Alert.meal_analysis_id.in_(ids)).order_by(Alert.created_at.desc()).limit(100)))


@app.put('/api/alerts/{id}/read')
def read_alert(id: int, user=Depends(current_user), db=Depends(get_db)):
    alert = db.get(Alert, id)
    if not alert:
        raise HTTPException(404)
    get_meal(db, user, alert.meal_analysis_id)
    alert.read = True
    db.commit()
    return {'ok': True}


@app.get('/api/settings')
def settings(user=Depends(current_user), db=Depends(get_db)):
    org = db.get(Organization, user.organization_id)
    preferences = {key: value for key, value in user.settings.items()
                   if key in ['theme', 'notifications', 'performance', 'reduce_motion']}
    return {'name': user.name, 'theme': 'dark', 'notifications': True, 'performance': False, 'reduce_motion': False, 'confidence_threshold': .75, 'waste_threshold': 30, **org.settings, **preferences, 'organization_name': org.name, 'model': os.getenv('YOLO_MODEL_PATH', 'Classical CV baseline')}


@app.put('/api/settings')
def update_settings(body: SettingsInput, user=Depends(current_user), db=Depends(get_db)):
    user.name = body.name
    values = body.model_dump(exclude={'name'})
    if user.role in ['ORGANIZATION_ADMIN', 'SUPER_ADMIN']:
        org = db.get(Organization, user.organization_id)
        org.settings = {
            **org.settings, **{k: values[k] for k in ['confidence_threshold', 'waste_threshold']}}
    values.pop('waste_threshold')
    values.pop('confidence_threshold')
    user.settings = values
    audit(db, user, 'settings.update')
    db.commit()
    return settings(user, db)


@app.get('/api/admin/users')
def users(user=Depends(admin), db=Depends(get_db)):
    q = select(User)
    if user.role != 'SUPER_ADMIN':
        q = q.where(User.organization_id == user.organization_id)
    return [public_user(u) for u in db.scalars(q)]


@app.post('/api/admin/users', status_code=201)
def add_user(body: InviteUser, user=Depends(admin), db=Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(409, 'This email is already registered.')
    organization_id = body.organization_id or user.organization_id
    if organization_id != user.organization_id and user.role != 'SUPER_ADMIN':
        raise HTTPException(
            403, 'Only a super administrator can provision users in another organization.')
    if not db.get(Organization, organization_id):
        raise HTTPException(404, 'Organization not found.')
    if body.cafeteria_id:
        cafe = db.get(Cafeteria, body.cafeteria_id)
        if not cafe or cafe.organization_id != organization_id:
            raise HTTPException(403)
    member = User(name=body.name, email=body.email, password_hash=passwords.hash(
        body.password), organization_id=organization_id, role=body.role, cafeteria_id=body.cafeteria_id)
    db.add(member)
    audit(db, user, 'user.create')
    db.commit()
    return public_user(member)


@app.put('/api/admin/users/{id}')
def edit_user(id: int, body: UserUpdate, user=Depends(admin), db=Depends(get_db)):
    member = db.get(User, id)
    if not member or (user.role != 'SUPER_ADMIN' and member.organization_id != user.organization_id):
        raise HTTPException(404)
    if member.id == user.id:
        raise HTTPException(
            400, 'Use another administrator account to change your own role.')
    if user.role != 'SUPER_ADMIN' and (body.role == 'SUPER_ADMIN' or member.role == 'SUPER_ADMIN'):
        raise HTTPException(403)
    if body.cafeteria_id:
        cafe = db.get(Cafeteria, body.cafeteria_id)
        if not cafe or cafe.organization_id != member.organization_id:
            raise HTTPException(403)
    member.role = body.role
    member.cafeteria_id = body.cafeteria_id
    member.token_version += 1
    audit(db, user, 'user.role', {'id': id, 'role': body.role})
    db.commit()
    return public_user(member)


@app.get('/api/admin/organizations')
def organizations(user=Depends(superadmin), db=Depends(
    get_db)): return list(db.scalars(select(Organization)))


@app.post('/api/admin/organizations', status_code=201)
def add_org(body: PlaceInput, user=Depends(superadmin), db=Depends(get_db)):
    org = Organization(name=body.name)
    db.add(org)
    db.flush()
    seed_org(db, org)
    audit(db, user, 'organization.create')
    db.commit()
    return org


@app.get('/api/admin/audit')
def audit_logs(user=Depends(superadmin), db=Depends(get_db)): return list(
    db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(200)))


@app.get('/api/admin/corrections')
def dataset(user=Depends(superadmin), db=Depends(get_db)): return list(
    db.scalars(select(Correction).order_by(Correction.created_at.desc()).limit(500)))


@app.get('/api/admin/model')
def model_config(user=Depends(superadmin), db=Depends(get_db)):
    runs = list(db.scalars(select(ModelRun).order_by(
        ModelRun.created_at.desc()).limit(30)))
    return {'model_path': os.getenv('YOLO_MODEL_PATH'), 'method': 'YOLO segmentation' if os.getenv('YOLO_MODEL_PATH') else 'Classical contrast segmentation', 'configuration': 'Set YOLO_MODEL_PATH to a locally trained segmentation checkpoint and restart. Arbitrary model uploads are intentionally not accepted.', 'dataset_export': '/api/admin/corrections', 'runs': [{'id': r.id, 'name': r.name, 'version': r.version, 'dataset_version': r.dataset_version, 'stage': r.stage, 'status': r.status, 'metrics': r.metrics, 'created_at': r.created_at} for r in runs], 'evaluation_note': 'Metrics appear only after a held-out evaluation run is registered; no accuracy is inferred from configuration.'}


# Serve a built frontend from the same origin, after all API routes.
DIST = Path(__file__).resolve().parent.parent/'frontend'/'dist'
if (DIST/'index.html').is_file() and (DIST/'assets').is_dir():
    app.mount('/assets', StaticFiles(directory=DIST/'assets'), name='assets')

    @app.get('/{path:path}')
    def frontend(path: str):
        if path.startswith('api/'):
            raise HTTPException(404)
        return FileResponse(DIST/'index.html')
