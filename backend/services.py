from datetime import datetime, timedelta, timezone
from collections import defaultdict
from sqlalchemy import select
from fastapi import HTTPException
from .models import *
from .security import ROLES

FOODS = ['Rice', 'Dal', 'Roti', 'Chapati', 'Sabzi', 'Curry', 'Paneer',
         'Salad', 'Fruit', 'Bread', 'Pasta', 'Noodles', 'Potato', 'Dessert', 'Other']
NUTRIENTS = ['calories_kcal', 'protein_g', 'carbs_g',
             'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg']


def seed_org(db, org):
    for name in FOODS:
        db.add(Food(organization_id=org.id, name=name,
               category=name, standard_portion=200, cost_per_kg=0))
    cafeteria = Cafeteria(organization_id=org.id, name='Main cafeteria')
    db.add(cafeteria)
    db.flush()
    db.add(Location(organization_id=org.id,
           cafeteria_id=cafeteria.id, name='Main dining room'))


def audit(db, user, action, detail=None):
    db.add(AuditLog(user_id=user.id if user else None,
           action=action, detail=detail or {}))


def scope(db, user):
    q = select(MealAnalysis)
    if user.role == 'SUPER_ADMIN':
        return q
    q = q.where(MealAnalysis.organization_id == user.organization_id)
    if user.role == 'USER':
        q = q.where(MealAnalysis.user_id == user.id)
    if user.role == 'CAFETERIA_MANAGER':
        q = q.where(MealAnalysis.location_id.in_(select(Location.id).where(Location.cafeteria_id ==
                    user.cafeteria_id))) if user.cafeteria_id else q.where(MealAnalysis.user_id == user.id)
    return q


def get_meal(db, user, id):
    meal = db.scalar(scope(db, user).where(MealAnalysis.id == id))
    if not meal:
        raise HTTPException(404, 'Analysis not found.')
    return meal


def food_dict(f):
    return {k: getattr(f, k) for k in ['id', 'food_id', 'label', 'initial_quantity', 'remaining_quantity', 'consumed_quantity', 'waste_quantity', 'waste_percentage', 'confidence', 'geometry', 'nutrition']}


def meal_dict(m, full=False):
    data = {k: getattr(m, k) for k in ['id', 'user_id', 'location_id', 'meal_type', 'status', 'stage', 'progress', 'error', 'total_served',
                                       'total_remaining', 'total_consumed', 'total_waste', 'waste_percentage', 'cost_wasted', 'confidence', 'verified', 'saved', 'demo', 'created_at']}
    data['created_at'] = m.created_at.replace(tzinfo=timezone.utc)
    if full:
        data.update(foods=[food_dict(f) for f in m.foods], details=m.details)
        data['images'] = {k: f'/api/analysis/{m.id}/image/{k}' for k in [
            'before', 'after', 'segmentation', 'detection', 'difference', 'waste']}
    return data


def recalculate(meal):
    meal.total_served = round(sum(f.initial_quantity for f in meal.foods), 2)
    meal.total_remaining = round(
        sum(f.remaining_quantity for f in meal.foods), 2)
    meal.total_waste = meal.total_remaining
    meal.total_consumed = round(meal.total_served-meal.total_remaining, 2)
    meal.waste_percentage = round(
        meal.total_waste/meal.total_served*100, 2) if meal.total_served else 0
    meal.confidence = min((f.confidence for f in meal.foods), default=0)
    meal.cost_wasted = round(
        sum(f.waste_quantity/1000*(f.cost_per_kg or 0) for f in meal.foods), 2)


def nutrition_for_quantities(values, served, remaining):
    """Return transparent nutrient estimates using configured values per 100 g."""
    served = max(0, float(served))
    remaining = min(served, max(0, float(remaining)))
    result = {}
    for key in NUTRIENTS:
        per_100 = float(values.get(key, 0) or 0)
        result[key] = {
            'served': round(per_100 * served / 100, 3),
            'remaining': round(per_100 * remaining / 100, 3),
            'consumed': round(per_100 * (served - remaining) / 100, 3),
            'wasted': round(per_100 * remaining / 100, 3),
        }
    return result


def refresh_food_nutrition(db, food_analysis):
    food = db.get(
        Food, food_analysis.food_id) if food_analysis.food_id else None
    values = (food.nutrition_per_100g or {}) if food else {}
    food_analysis.nutrition = {
        'per_100g': values,
        'source': food.nutrition_source if food else None,
        'source_version': food.nutrition_source_version if food else None,
        'estimated': nutrition_for_quantities(values, food_analysis.initial_quantity, food_analysis.remaining_quantity),
    }


def nutrition_summary(meals):
    totals = {key: {'served': 0, 'consumed': 0, 'remaining': 0, 'wasted': 0}
              for key in NUTRIENTS}
    by_food = defaultdict(lambda: {key: {
                          'served': 0, 'consumed': 0, 'remaining': 0, 'wasted': 0} for key in NUTRIENTS})
    days = defaultdict(lambda: {key: {
                       'served': 0, 'consumed': 0, 'remaining': 0, 'wasted': 0} for key in NUTRIENTS})
    source_notes = set()
    for meal in meals:
        day = meal.created_at.strftime('%Y-%m-%d')
        for item in meal.foods:
            snapshot = item.nutrition or {}
            nutrition = snapshot.get('estimated', {})
            source = snapshot.get('source')
            version = snapshot.get('source_version')
            if source:
                source_notes.add(f'{source} · {version or "unversioned"}')
            for nutrient in NUTRIENTS:
                for state in totals[nutrient]:
                    value = float(nutrition.get(
                        nutrient, {}).get(state, 0) or 0)
                    totals[nutrient][state] += value
                    by_food[item.label][nutrient][state] += value
                    days[day][nutrient][state] += value
    for group in [totals, *by_food.values(), *days.values()]:
        for values in group.values():
            for state, value in values.items():
                values[state] = round(value, 3)
    return {
        'totals': totals,
        'foods': [{'name': name, 'nutrition': values} for name, values in by_food.items()],
        'trends': [{'name': name, 'nutrition': values} for name, values in sorted(days.items())],
        'sources': sorted(source_notes),
    }


def filtered(db, user, start=None, end=None, include_demo=False):
    q = scope(db, user).where(MealAnalysis.status ==
                              'complete', MealAnalysis.saved == True)
    if not include_demo:
        q = q.where(MealAnalysis.demo == False)
    if start:
        q = q.where(MealAnalysis.created_at >=
                    datetime.combine(start, datetime.min.time()))
    if end:
        q = q.where(MealAnalysis.created_at < datetime.combine(
            end+timedelta(days=1), datetime.min.time()))
    return list(db.scalars(q.order_by(MealAnalysis.created_at)))


def summarize(meals):
    served = sum(m.total_served for m in meals)
    wasted = sum(m.total_waste for m in meals)
    return {'meals': len(meals), 'served': round(served, 2), 'remaining': round(wasted, 2), 'consumed': round(served-wasted, 2), 'wasted': round(wasted, 2), 'waste_percentage': round(wasted/served*100, 2) if served else 0, 'average_waste_percentage': round(sum(m.waste_percentage for m in meals)/len(meals), 2) if meals else 0, 'cost': round(sum(m.cost_wasted for m in meals), 2), 'verified': sum(m.verified for m in meals), 'uncalibrated_cost_items': sum(f.food_id is None or f.cost_per_kg == 0 for m in meals for f in m.foods)}


def analytics(db, user, meals, period='daily'):
    groups = {k: defaultdict(list) for k in [
        'trends', 'meal_time', 'locations', 'cafeterias']}
    foods = defaultdict(
        lambda: {'served': 0, 'wasted': 0, 'cost': 0, 'count': 0})
    for m in meals:
        date = m.created_at
        key = date.strftime('%Y-%m-%d') if period == 'daily' else ((date-timedelta(
            days=date.weekday())).strftime('%Y-%m-%d') if period == 'weekly' else date.strftime('%Y-%m'))
        location = db.get(Location, m.location_id) if m.location_id else None
        cafeteria = db.get(
            Cafeteria, location.cafeteria_id) if location and location.cafeteria_id else None
        for group, name in [('trends', key), ('meal_time', m.meal_type), ('locations', location.name if location else 'Unassigned'), ('cafeterias', cafeteria.name if cafeteria else 'Unassigned')]:
            groups[group][name].append(m)
        for f in m.foods:
            d = foods[f.label]
            d['served'] += f.initial_quantity
            d['wasted'] += f.waste_quantity
            d['cost'] += f.waste_quantity*f.cost_per_kg/1000
            d['count'] += 1
    result = {k: [{'name': name, **summarize(rows)}
                  for name, rows in v.items()] for k, v in groups.items()}
    result['foods'] = [{'name': name, **d, 'waste_percentage': round(
        d['wasted']/d['served']*100, 2) if d['served'] else 0} for name, d in foods.items()]
    result['overview'] = summarize(meals)
    impacts = {}
    for m in meals:
        for f in m.foods:
            for kind, factor in f.geometry.get('impact_factors', {}).items():
                key = (kind, factor['unit'],
                       factor['source'], factor['version'])
                impacts[key] = impacts.get(
                    key, 0)+f.waste_quantity/1000*factor['value']
    result['impacts'] = [{'kind': key[0], 'unit': key[1].replace(
        '/kg food', ''), 'source': key[2], 'version': key[3], 'value': round(value, 2)} for key, value in impacts.items()]
    result['insights'] = []
    result['recommendations'] = []
    if len(meals) < 3:
        result['insights'] = [
            'Not enough historical data to generate a reliable insight. Save at least three non-demo meals.']
    else:
        top = max(result['foods'], key=lambda f: f['wasted'], default=None)
        if top:
            result['insights'].append(
                f"{top['name']} represents the highest recorded waste: {top['wasted']:.0f} g estimated across this period.")
        for f in result['foods']:
            if f['count'] >= 3 and f['waste_percentage'] > 20:
                average = f['served']/f['count']
                reduction = min(.2, f['waste_percentage']/200)
                result['recommendations'].append({'food': f['name'], 'sample_count': f['count'], 'current': round(average), 'low': round(
                    average*(1-reduction)), 'high': round(average*(1-reduction/2)), 'label': 'Data-driven experimental recommendation. Not nutritional advice.'})
        if len(meals) >= 6:
            mid = len(meals)//2
            earlier = summarize(meals[:mid])['waste_percentage']
            later = summarize(meals[mid:])['waste_percentage']
            result['insights'].append(
                f'Recorded waste changed by {later-earlier:+.1f} percentage points between the first and second halves of this period.')
    return result


def create_alerts(db, meal, user):
    if meal.demo:
        return
    org = db.get(Organization, meal.organization_id)
    threshold = org.settings.get('waste_threshold', 30)
    messages = []
    if meal.waste_percentage >= threshold:
        messages.append(
            f'High plate waste: {meal.waste_percentage:.1f}% estimated (threshold {threshold:g}%).')
    prior = list(db.scalars(select(MealAnalysis).where(MealAnalysis.user_id == meal.user_id, MealAnalysis.saved == True, MealAnalysis.demo ==
                 False, MealAnalysis.status == 'complete', MealAnalysis.id != meal.id).order_by(MealAnalysis.created_at.desc()).limit(6)))
    if len(prior) >= 2 and all(m.waste_percentage >= threshold for m in [meal, *prior[:2]]):
        messages.append('Repeated high waste across three recorded meals.')
    if len(prior) >= 3 and meal.waste_percentage > sum(m.waste_percentage for m in prior[:3])/3+10:
        messages.append(
            'Plate waste increased by more than 10 percentage points over the previous three meals.')
    for f in meal.foods:
        if f.waste_percentage >= threshold:
            messages.append(
                f'{f.label}: {f.waste_percentage:.1f}% remains. Review the serving size.')
    if len(prior) >= 2:
        for key, label in [('location_id', 'Location'), ('meal_type', 'Meal time')]:
            same = [m for m in prior if getattr(m, key) == getattr(meal, key)]
            if len(same) >= 2 and summarize([meal, *same])['waste_percentage'] >= threshold:
                messages.append(
                    f'{label} waste exceeds the configured threshold across recent meals.')
    for message in messages:
        db.add(Alert(meal_analysis_id=meal.id, user_id=user.id, message=message))
