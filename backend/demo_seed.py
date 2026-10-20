"""Explicit, idempotent LOCAL demo seeding. No demo users are created on startup."""
import uuid
from datetime import timedelta
from sqlalchemy import select
from .db import Session, DATA
from .models import *
from .security import passwords, ROLES
from .services import seed_org, recalculate, analytics, refresh_food_nutrition
from .vision import demo_images, pipeline

ACCOUNTS = [('admin@secondserve.local', 'SecondServe@Admin123', 'Second Serve Admin', 'SUPER_ADMIN'), ('manager@secondserve.local', 'SecondServe@Manager123', 'Demo Cafeteria Manager',
                                                                                                       'CAFETERIA_MANAGER'), ('user@secondserve.local', 'SecondServe@User123', 'Demo User', 'USER'), ('orgadmin@secondserve.local', 'SecondServe@Org123', 'Organization Admin', 'ORGANIZATION_ADMIN')]


def seed_demo():
    with Session() as db:
        for role in ROLES:
            if not db.get(Role, role):
                db.add(Role(id=role))
        org = db.scalar(select(Organization).where(
            Organization.name == 'Second Serve Demo Organization'))
        if not org:
            org = Organization(name='Second Serve Demo Organization', settings={
                               'demo_workspace': True, 'waste_threshold': 30, 'confidence_threshold': .75})
            db.add(org)
            db.flush()
            seed_org(db, org)
        cafes = list(db.scalars(select(Cafeteria).where(
            Cafeteria.organization_id == org.id)))
        cafe = cafes[0]
        cafe.name = 'Green Plate Cafeteria'
        locs = list(db.scalars(select(Location).where(
            Location.organization_id == org.id)))
        if locs:
            locs[0].name = 'Main Campus'
        for name in ['Main Campus', 'Hostel Dining', 'Staff Cafeteria']:
            if not any(l.name == name for l in locs):
                l = Location(name=name, organization_id=org.id,
                             cafeteria_id=cafe.id)
                db.add(l)
                locs.append(l)
        db.flush()
        users = {}
        for email, password, name, role in ACCOUNTS:
            user = db.scalar(select(User).where(User.email == email))
            if not user:
                user = User(name=name, email=email, password_hash=passwords.hash(password), role=role,
                            organization_id=org.id, cafeteria_id=cafe.id if role == 'CAFETERIA_MANAGER' else None)
                db.add(user)
                db.flush()
            elif user.organization_id != org.id:
                raise RuntimeError(
                    f'{email} already belongs to a different organization; refusing to overwrite it.')
            users[role] = user
        foods = list(db.scalars(select(Food).where(
            Food.organization_id == org.id)))
        prices = {'Rice': 60, 'Dal': 120, 'Roti': 100, 'Sabzi': 85, 'Paneer': 320,
                  'Salad': 70, 'Potato': 45, 'Pasta': 150, 'Fruit': 110, 'Dessert': 240}
        nutrition = {'Rice': {'calories_kcal': 130, 'protein_g': 2.7, 'carbs_g': 28.2}, 'Dal': {'calories_kcal': 116, 'protein_g': 9, 'carbs_g': 20}, 'Roti': {'calories_kcal': 297, 'protein_g': 9.6, 'carbs_g': 55}, 'Sabzi': {
            'calories_kcal': 70, 'protein_g': 2.5, 'carbs_g': 10}, 'Paneer': {'calories_kcal': 265, 'protein_g': 18.3, 'fat_g': 20.8}, 'Salad': {'calories_kcal': 25, 'protein_g': 1.2, 'carbs_g': 5}, 'Fruit': {'calories_kcal': 60, 'protein_g': .6, 'carbs_g': 15}}
        for f in foods:
            f.nutrition_per_100g = nutrition.get(f.name, {})
            f.nutrition_source = 'Illustrative local demo configuration — replace with a verified source'
            f.nutrition_source_version = 'demo-v1'
            if not db.scalar(select(FoodCost).where(FoodCost.food_id == f.id)):
                f.cost_per_kg = prices.get(f.name, 100)
                f.standard_portion = 150 if f.name in [
                    'Salad', 'Fruit', 'Dessert'] else 200
                f.impact_factor = {'co2e': {'value': 1.5, 'unit': 'kg CO2e/kg food', 'source': 'CONFIGURABLE DEMO FACTOR — illustrative only, not a scientific constant', 'version': 'demo-v1'},
                                   'water': {'value': 100, 'unit': 'L/kg food', 'source': 'CONFIGURABLE DEMO FACTOR — illustrative only, not a scientific constant', 'version': 'demo-v1'}}
                db.add(FoodCost(food_id=f.id, value=f.cost_per_kg))
                db.add(PortionConfig(food_id=f.id, grams=f.standard_portion,
                       source='Configurable demo serving'))
                db.add(ImpactFactor(food_id=f.id, values=f.impact_factor))
        db.commit()
        for i in range(36):
            id = str(uuid.uuid5(uuid.NAMESPACE_URL,
                     f'secondserve-local-demo-meal-{i}'))
            if db.get(MealAnalysis, id):
                continue
            owner = users['USER' if i % 4 < 2 else 'CAFETERIA_MANAGER' if i %
                          4 == 2 else 'ORGANIZATION_ADMIN']
            folder = DATA/'images'/id
            scale = .22+(i % 8)*.08
            before, after = demo_images(folder/'source', scale)
            rows, details = pipeline(
                before, after, folder, 350+(i % 6)*40, lambda *_: None)
            details['notes'].insert(
                0, 'SEEDED DEMO: synthetic illustrated plates processed by the real pipeline. Assigned food names and configured factors are illustrative, not model predictions.')
            m = MealAnalysis(id=id, user_id=owner.id, organization_id=org.id, location_id=locs[i % len(locs)].id, meal_type=['Breakfast', 'Lunch', 'Dinner', 'Snacks'][i % 4], before_image=str(
                before), after_image=str(after), status='complete', stage='Ready for review', progress=100, demo=True, saved=True, details=details, created_at=now()-timedelta(days=35-i, hours=i % 8))
            db.add(m)
            for j, row in enumerate(rows):
                f = foods[(i+j*3) % len(foods)]
                row['label'] = f.name
                row['geometry']['impact_factors'] = f.impact_factor
                item = FoodAnalysis(**row, food_id=f.id,
                                    cost_per_kg=f.cost_per_kg)
                refresh_food_nutrition(db, item)
                m.foods.append(item)
            recalculate(m)
            db.flush()
            if m.waste_percentage >= 30:
                db.add(Alert(meal_analysis_id=id, user_id=owner.id,
                       message=f'DEMO: {m.waste_percentage:.1f}% estimated plate waste at {locs[i % len(locs)].name}. Review the serving size.', created_at=m.created_at))
            db.commit()
        for u in users.values():
            if db.scalar(select(Recommendation).where(Recommendation.user_id == u.id)):
                continue
            q = select(MealAnalysis).where(
                MealAnalysis.organization_id == org.id, MealAnalysis.demo == True)
            if u.role == 'USER':
                q = q.where(MealAnalysis.user_id == u.id)
            data = analytics(db, u, list(db.scalars(q)))
            for item in data['recommendations']:
                db.add(Recommendation(organization_id=org.id,
                       user_id=u.id, content={**item, 'demo': True}))
        db.add(AuditLog(user_id=users['SUPER_ADMIN'].id, action='demo.seed', detail={
               'idempotent': True, 'synthetic_meals': 36}))
        db.commit()
    print('Local demo workspace is ready. Credentials are documented in README.md.')


if __name__ == '__main__':
    seed_demo()
