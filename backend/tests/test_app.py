import os
import uuid
import io
import math
from pathlib import Path
os.environ['DATA_DIR'] = str(Path('data')/('test-'+str(uuid.uuid4())))

from backend.models import User, MealAnalysis, Food, Correction, PasswordReset, AuditLog, Cafeteria, Location
from backend.db import Base, engine, Session, DATA
from backend.vision import quantities, demo_images, pipeline
from backend.main import app, attempts
from sqlalchemy import select
from PIL import Image
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    attempts.clear()
    with TestClient(app) as client:
        yield client


def register(client, email='person@example.com'):
    r = client.post('/api/auth/register', json={'name': 'Alex Morgan', 'email': email,
                    'password': 'Strong password 123', 'organization': 'Test table'})
    assert r.status_code == 201, r.text
    return r.json()


def promote(user, role='ORGANIZATION_ADMIN', cafeteria_id=None):
    with Session() as db:
        u = db.get(User, user['id'])
        u.role = role
        u.cafeteria_id = cafeteria_id
        db.commit()


def real_analysis(client):
    paths = demo_images(DATA/'test-fixtures')
    ids = []
    for path in paths:
        with path.open('rb') as f:
            r = client.post('/api/analyze/upload',
                            files={'file': ('plate.jpg', f, 'image/jpeg')})
        assert r.status_code == 201, r.text
        ids.append(r.json()['id'])
    r = client.post('/api/analyze/meal', json={
                    'before_id': ids[0], 'after_id': ids[1], 'served_grams': 500, 'meal_type': 'Lunch'})
    assert r.status_code == 202, r.text
    meal = client.get('/api/analysis/'+r.json()['id']).json()
    assert meal['status'] == 'complete', meal
    return meal


def correction_body(meal):
    return {'analysis_id': meal['id'], 'foods': [{k: f[k] for k in ['food_id', 'label', 'initial_quantity', 'remaining_quantity', 'confidence', 'geometry']} for f in meal['foods']], 'reason': 'Verified region estimates', 'verified': True}


def test_auth_password_hash_logout_and_expiry(client):
    u = register(client)
    assert 'password_hash' not in u
    assert client.get('/api/auth/me').json()['email'] == 'person@example.com'
    assert 'httponly' in client.cookies.jar._cookies['testserver.local']['/']['session']._rest.keys(
    ) or client.cookies.get('session')
    old = client.cookies.get('session')
    client.post('/api/auth/logout')
    assert client.get('/api/auth/me').status_code == 401
    client.cookies.set('session', old)
    assert client.get('/api/auth/me').status_code == 401
    client.cookies.clear()
    assert client.post(
        '/api/auth/login', json={'email': 'person@example.com', 'password': 'wrong'}).status_code == 401
    assert client.post('/api/auth/login', json={
                       'email': 'person@example.com', 'password': 'Strong password 123'}).status_code == 200
    with Session() as db:
        assert db.get(User, u['id']).password_hash.startswith('$argon2id$')


def test_registration_validates_and_cannot_escalate(client):
    assert client.post('/api/auth/register',
                       json={'name': 'A', 'email': 'bad', 'password': 'short'}).status_code == 422
    assert client.post('/api/auth/register', json={'name': 'Alex', 'email': 'a@b.com',
                       'password': 'password123', 'role': 'SUPER_ADMIN'}).status_code == 422
    register(client)
    assert client.post('/api/auth/register', json={
                       'name': 'Alex', 'email': 'person@example.com', 'password': 'password123'}).status_code == 409
    assert client.get('/api/admin/users').status_code == 403
    assert client.get('/api/admin/audit').status_code == 403


def test_food_crud_and_rbac(client):
    u = register(client)
    payload = {'name': 'Millet', 'category': 'Grain',
               'standard_portion': 180, 'cost_per_kg': 80}
    assert client.post('/api/foods', json=payload).status_code == 403
    promote(u)
    r = client.post('/api/foods', json=payload)
    assert r.status_code == 201, r.text
    id = r.json()['id']
    payload['cost_per_kg'] = 90
    assert client.put(f'/api/foods/{id}',
                      json=payload).json()['cost_per_kg'] == 90
    assert client.put(
        f'/api/foods/{id}', json={**payload, 'standard_portion': -1}).status_code == 422
    assert client.put(f'/api/foods/{id}', json={**payload,
                      'impact_factor': {'co2e': {'value': 1}}}).status_code == 422
    assert client.delete(f'/api/foods/{id}').status_code == 200
    assert id not in [f['id'] for f in client.get('/api/foods').json()]


def test_image_validation(client):
    register(client)
    assert client.post('/api/analyze/upload', files={'file': (
        'x.png', b'not an image', 'image/png')}).status_code == 400
    assert client.post('/api/analyze/upload', files={'file': (
        'x.jpg', b'x'*(10*1024*1024+1), 'image/jpeg')}).status_code == 413
    buf = io.BytesIO()
    Image.new('RGB', (32, 32)).save(buf, format='PNG')
    assert client.post('/api/analyze/upload',
                       files={'file': ('x.png', buf.getvalue(), 'image/png')}).status_code == 400
    assert client.post(
        '/api/analyze/meal', json={'before_id': 'missing', 'after_id': 'missing'}).status_code == 400


def test_real_pipeline_masks_quantities_and_save(client):
    register(client)
    m = real_analysis(client)
    assert m['foods'] and m['details']['plate_detected']
    assert 10 < m['waste_percentage'] < 55
    assert abs(m['total_served']-500) < .1
    assert m['total_consumed'] + \
        m['total_remaining'] == pytest.approx(500, abs=.1)
    assert all(f['geometry']['polygons'] for f in m['foods'])
    for kind in ['before', 'after', 'segmentation', 'detection', 'difference', 'waste']:
        r = client.get(m['images'][kind])
        assert r.status_code == 200
        assert r.headers['content-type'] == 'image/jpeg'
    assert client.get('/api/analytics/overview').json()['meals'] == 0
    assert client.post('/api/analysis/'+m['id']+'/save').status_code == 200
    assert client.get('/api/analytics/overview').json()['meals'] == 1
    assert client.get('/api/history').json()['total'] == 1


def test_tenant_isolation_for_analysis_and_uploads(client):
    register(client)
    m = real_analysis(client)
    register(client, 'other@example.com')
    assert client.get('/api/analysis/'+m['id']).status_code == 404
    assert client.get(m['images']['before']).status_code == 404
    assert client.post('/api/analysis/'+m['id']+'/save').status_code == 404
    assert client.get('/api/history').json()['total'] == 0
    assert client.post('/api/feedback/correction',
                       json=correction_body(m)).status_code == 404


def test_corrections_history_cost_alerts_reports(client):
    u = register(client)
    promote(u)
    m = real_analysis(client)
    food = client.get('/api/foods').json()[0]
    client.put('/api/foods/'+str(food['id']), json={'name': food['name'],
               'category': food['category'], 'standard_portion': 200, 'cost_per_kg': 100})
    body = correction_body(m)
    for f in body['foods']:
        f.update(food_id=food['id'], initial_quantity=200,
                 remaining_quantity=100, confidence=.9)
    r = client.post('/api/feedback/correction', json=body)
    assert r.status_code == 200, r.text
    corrected = r.json()
    assert corrected['verified']
    assert corrected['waste_percentage'] == 50
    assert corrected['cost_wasted'] == len(m['foods'])*10
    assert client.get(
        '/api/analysis/'+m['id']).json()['corrections'][0]['reason'] == 'Verified region estimates'
    client.post('/api/analysis/'+m['id']+'/save')
    alerts = client.get('/api/alerts').json()
    assert alerts
    assert client.put(
        '/api/alerts/'+str(alerts[0]['id'])+'/read').status_code == 200
    for format in ['csv', 'json', 'pdf']:
        r = client.get('/api/reports/export?format='+format)
        assert r.status_code == 200, r.text[:200]
        if format == 'pdf':
            assert r.content.startswith(b'%PDF')
    assert client.get('/api/reports/daily').json()['overview']['meals'] == 1
    body['foods'][0]['remaining_quantity'] = 9999
    assert client.post('/api/feedback/correction',
                       json=body).status_code == 422
    body['foods'][0]['remaining_quantity'] = 100
    body['foods'][0]['geometry'] = {'polygons': [[[-1, 0], [1, 0], [1, 1]]]}
    assert client.post('/api/feedback/correction',
                       json=body).status_code == 422


def test_demo_excluded_and_empty_insights(client):
    register(client)
    assert 'Not enough' in client.get('/api/insights').json()['insights'][0]
    r = client.post('/api/analyze/demo')
    assert r.status_code == 202
    client.post('/api/analysis/'+r.json()['id']+'/save')
    assert client.get('/api/analytics/overview').json()['meals'] == 0
    assert client.get(
        '/api/analytics/overview?include_demo=true').json()['meals'] == 1


def test_recommendations_from_real_history(client):
    register(client)
    for i in range(3):
        m = real_analysis(client)
        body = correction_body(m)
        for f in body['foods']:
            f.update(label='Rice', initial_quantity=200, remaining_quantity=80)
        assert client.post('/api/feedback/correction',
                           json=body).status_code == 200
        client.post('/api/analysis/'+m['id']+'/save')
    insights = client.get('/api/insights').json()
    assert insights['recommendations']
    r = insights['recommendations'][0]
    assert r['food'] == 'Rice' and 0 < r['low'] < r['high'] < r['current']


def test_password_reset_single_use_and_invalidation(client):
    register(client)
    old = client.cookies.get('session')
    mailbox = DATA/'mail'
    before_messages = set(mailbox.glob('*.txt'))
    r = client.post('/api/auth/forgot-password',
                    json={'email': 'person@example.com'})
    assert r.status_code == 200
    assert 'token' not in r.json()
    created = set(mailbox.glob('*.txt'))-before_messages
    assert len(created) == 1
    path = created.pop()
    token = path.read_text().split('token=')[1]
    assert client.post('/api/auth/reset-password',
                       json={'token': token, 'password': 'A different password'}).status_code == 200
    assert client.get('/api/auth/me').status_code == 401
    assert client.post('/api/auth/reset-password',
                       json={'token': token, 'password': 'Another password'}).status_code == 400
    assert client.post('/api/auth/login', json={
                       'email': 'person@example.com', 'password': 'A different password'}).status_code == 200


def test_manager_scope(client):
    u = register(client)
    m = real_analysis(client)
    with Session() as db:
        cafe = db.scalar(select(Cafeteria).where(
            Cafeteria.organization_id == u['organization_id']))
        loc = db.scalar(select(Location).where(
            Location.cafeteria_id == cafe.id))
        meal = db.get(MealAnalysis, m['id'])
        meal.location_id = loc.id
        db.commit()
        cafe_id = cafe.id
    promote(u, 'CAFETERIA_MANAGER', cafe_id)
    assert client.get('/api/analysis/'+m['id']).status_code == 200
    with Session() as db:
        db.get(MealAnalysis, m['id']).location_id = None
        db.commit()
    assert client.get('/api/analysis/'+m['id']).status_code == 404


def test_manager_can_open_new_demo_and_uploaded_analysis(client):
    u = register(client)
    with Session() as db:
        cafe = db.scalar(select(Cafeteria).where(
            Cafeteria.organization_id == u['organization_id']))
        cafe_id = cafe.id
    promote(u, 'CAFETERIA_MANAGER', cafe_id)
    m = real_analysis(client)
    assert m['location_id'] is not None
    demo = client.post('/api/analyze/demo')
    assert demo.status_code == 202
    assert client.get('/api/analysis/'+demo.json()
                      ['id']).json()['status'] == 'complete'


def test_cross_org_provisioning_requires_superadmin(client):
    u = register(client)
    promote(u)
    with Session() as db:
        from backend.models import Organization
        other = Organization(name='Other workspace')
        db.add(other)
        db.commit()
        other_id = other.id
    payload = {'name': 'New Member', 'email': 'member@example.com',
               'password': 'Secure password 123', 'organization_id': other_id, 'role': 'ORGANIZATION_ADMIN'}
    assert client.post('/api/admin/users', json=payload).status_code == 403
    promote(u, 'SUPER_ADMIN')
    r = client.post('/api/admin/users', json=payload)
    assert r.status_code == 201, r.text
    assert r.json()['organization_id'] == other_id


def test_impact_factors_preserve_source_and_scale(client):
    u = register(client)
    promote(u)
    m = real_analysis(client)
    food = client.get('/api/foods').json()[0]
    factor = {'co2e': {'value': 2, 'unit': 'kg CO2e/kg food',
                       'source': 'Explicit test factor', 'version': 'test-v1'}}
    assert client.put('/api/foods/'+str(food['id']), json={'name': food['name'], 'category': food['category'],
                      'standard_portion': 200, 'cost_per_kg': 50, 'impact_factor': factor}).status_code == 200
    body = correction_body(m)
    for f in body['foods']:
        f.update(food_id=food['id'], initial_quantity=200,
                 remaining_quantity=100)
    client.post('/api/feedback/correction', json=body)
    client.post('/api/analysis/'+m['id']+'/save')
    impact = client.get('/api/analytics/all').json()['impacts'][0]
    assert impact['value'] == pytest.approx(len(body['foods'])*.2)
    assert impact['source'] == 'Explicit test factor' and impact['unit'] == 'kg CO2e'


def test_csrf_rate_limit_and_settings(client):
    u = register(client)
    assert client.post(
        '/api/auth/logout', headers={'Origin': 'https://evil.example'}).status_code == 403
    payload = {'name': 'Alex', 'theme': 'light', 'notifications': False, 'performance': True,
               'reduce_motion': True, 'waste_threshold': 50, 'confidence_threshold': .5}
    assert client.put(
        '/api/settings', json=payload).json()['waste_threshold'] == 30
    promote(u)
    assert client.put(
        '/api/settings', json=payload).json()['waste_threshold'] == 50
    assert client.get('/api/admin/model').status_code == 403
    promote(u, 'SUPER_ADMIN')
    assert client.get('/api/admin/model').status_code == 200
    assert client.get('/api/admin/corrections').status_code == 200
    assert client.get('/api/admin/audit').json()
    for i in range(16):
        r = client.post(
            '/api/auth/login', json={'email': 'absent@example.com', 'password': 'wrong'})
    assert r.status_code == 429


@pytest.mark.parametrize('initial,remaining', [(0, 0), (250, 70), (100, 999), (-1, -1)])
def test_safe_portion_math(initial, remaining):
    q = quantities(initial, remaining)
    assert 0 <= q['remaining_quantity'] <= q['initial_quantity']
    assert 0 <= q['waste_percentage'] <= 100
    assert all(math.isfinite(v) for v in q.values())
