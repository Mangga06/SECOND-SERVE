from datetime import datetime, timezone
from sqlalchemy import String, ForeignKey, Float, JSON, DateTime, Boolean, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base


def now():
    return datetime.now(timezone.utc)


class Timestamp:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now, index=True)


class Role(Base):
    __tablename__ = 'roles'
    id: Mapped[str] = mapped_column(String(40), primary_key=True)


class Organization(Base, Timestamp):
    __tablename__ = 'organizations'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    settings: Mapped[dict] = mapped_column(JSON, default=dict)


class Cafeteria(Base, Timestamp):
    __tablename__ = 'cafeterias'
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey('organizations.id'), index=True)
    name: Mapped[str] = mapped_column(String(120))


class Location(Base, Timestamp):
    __tablename__ = 'locations'
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey('organizations.id'), index=True)
    cafeteria_id: Mapped[int | None] = mapped_column(
        ForeignKey('cafeterias.id'))
    name: Mapped[str] = mapped_column(String(120))


class User(Base, Timestamp):
    __tablename__ = 'users'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(ForeignKey('roles.id'), default='USER')
    organization_id: Mapped[int] = mapped_column(
        ForeignKey('organizations.id'), index=True)
    cafeteria_id: Mapped[int | None] = mapped_column(
        ForeignKey('cafeterias.id'))
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    token_version: Mapped[int] = mapped_column(default=0)


class Food(Base, Timestamp):
    __tablename__ = 'foods'
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey('organizations.id'), index=True)
    name: Mapped[str] = mapped_column(String(80))
    category: Mapped[str] = mapped_column(String(80))
    standard_portion: Mapped[float] = mapped_column(Float, default=200)
    cost_per_kg: Mapped[float] = mapped_column(Float, default=0)
    impact_factor: Mapped[dict] = mapped_column(JSON, default=dict)
    nutrition_per_100g: Mapped[dict] = mapped_column(JSON, default=dict)
    nutrition_source: Mapped[str | None] = mapped_column(String(240))
    nutrition_source_version: Mapped[str | None] = mapped_column(String(80))
    nutrition_updated_at: Mapped[datetime |
                                 None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class PortionConfig(Base, Timestamp):
    __tablename__ = 'portion_configs'
    id: Mapped[int] = mapped_column(primary_key=True)
    food_id: Mapped[int] = mapped_column(ForeignKey('foods.id'), index=True)
    grams: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(200))


class FoodCost(Base, Timestamp):
    __tablename__ = 'food_costs'
    id: Mapped[int] = mapped_column(primary_key=True)
    food_id: Mapped[int] = mapped_column(ForeignKey('foods.id'), index=True)
    value: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(10), default='INR')


class ImpactFactor(Base, Timestamp):
    __tablename__ = 'impact_factors'
    id: Mapped[int] = mapped_column(primary_key=True)
    food_id: Mapped[int] = mapped_column(ForeignKey('foods.id'), index=True)
    values: Mapped[dict] = mapped_column(JSON)


class Upload(Base, Timestamp):
    __tablename__ = 'uploads'
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), index=True)
    path: Mapped[str] = mapped_column(String(200))


class MealAnalysis(Base, Timestamp):
    __tablename__ = 'meal_analyses'
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), index=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey('organizations.id'), index=True)
    location_id: Mapped[int | None] = mapped_column(
        ForeignKey('locations.id'), index=True)
    meal_type: Mapped[str] = mapped_column(String(20))
    before_image: Mapped[str] = mapped_column(String(200))
    after_image: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(
        String(30), default='queued', index=True)
    stage: Mapped[str] = mapped_column(String(100), default='Queued')
    progress: Mapped[int] = mapped_column(default=0)
    error: Mapped[str | None] = mapped_column(String(300))
    total_served: Mapped[float] = mapped_column(Float, default=0)
    total_remaining: Mapped[float] = mapped_column(Float, default=0)
    total_consumed: Mapped[float] = mapped_column(Float, default=0)
    total_waste: Mapped[float] = mapped_column(Float, default=0)
    waste_percentage: Mapped[float] = mapped_column(Float, default=0)
    cost_wasted: Mapped[float] = mapped_column(Float, default=0)
    confidence: Mapped[float] = mapped_column(Float, default=0)
    verified: Mapped[bool] = mapped_column(default=False)
    saved: Mapped[bool] = mapped_column(default=False)
    demo: Mapped[bool] = mapped_column(default=False)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    foods: Mapped[list['FoodAnalysis']] = relationship(
        back_populates='meal', cascade='all, delete-orphan')


class FoodAnalysis(Base):
    __tablename__ = 'food_analyses'
    id: Mapped[int] = mapped_column(primary_key=True)
    meal_analysis_id: Mapped[str] = mapped_column(
        ForeignKey('meal_analyses.id'), index=True)
    food_id: Mapped[int | None] = mapped_column(
        ForeignKey('foods.id'), index=True)
    label: Mapped[str] = mapped_column(String(100))
    initial_quantity: Mapped[float] = mapped_column(Float)
    remaining_quantity: Mapped[float] = mapped_column(Float)
    consumed_quantity: Mapped[float] = mapped_column(Float)
    waste_quantity: Mapped[float] = mapped_column(Float)
    waste_percentage: Mapped[float] = mapped_column(Float)
    confidence: Mapped[float] = mapped_column(Float)
    geometry: Mapped[dict] = mapped_column(JSON, default=dict)
    cost_per_kg: Mapped[float] = mapped_column(Float, default=0)
    nutrition: Mapped[dict] = mapped_column(JSON, default=dict)
    meal: Mapped['MealAnalysis'] = relationship(back_populates='foods')


class Correction(Base, Timestamp):
    __tablename__ = 'corrections'
    id: Mapped[int] = mapped_column(primary_key=True)
    meal_analysis_id: Mapped[str] = mapped_column(
        ForeignKey('meal_analyses.id'), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    before: Mapped[dict] = mapped_column(JSON)
    after: Mapped[dict] = mapped_column(JSON)
    reason: Mapped[str] = mapped_column(String(500))


class Recommendation(Base, Timestamp):
    __tablename__ = 'recommendations'
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey('organizations.id'), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    content: Mapped[dict] = mapped_column(JSON)


class Alert(Base, Timestamp):
    __tablename__ = 'alerts'
    id: Mapped[int] = mapped_column(primary_key=True)
    meal_analysis_id: Mapped[str] = mapped_column(
        ForeignKey('meal_analyses.id'), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), index=True)
    message: Mapped[str] = mapped_column(String(500))
    read: Mapped[bool] = mapped_column(default=False)


class Report(Base, Timestamp):
    __tablename__ = 'reports'
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), index=True)
    format: Mapped[str] = mapped_column(String(10))
    filters: Mapped[dict] = mapped_column(JSON)


class AuditLog(Base, Timestamp):
    __tablename__ = 'audit_logs'
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey('users.id'), index=True)
    action: Mapped[str] = mapped_column(String(100))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)


class PasswordReset(Base, Timestamp):
    __tablename__ = 'password_resets'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(default=False)


class FitnessProfile(Base, Timestamp):
    __tablename__ = 'fitness_profiles'
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey('users.id'), unique=True, index=True)
    age: Mapped[int | None] = mapped_column(Integer)
    height_cm: Mapped[float | None] = mapped_column(Float)
    weight_kg: Mapped[float | None] = mapped_column(Float)
    activity_level: Mapped[str | None] = mapped_column(String(40))
    fitness_goal: Mapped[str | None] = mapped_column(String(40))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now, onupdate=now)


class NutritionHistory(Base, Timestamp):
    __tablename__ = 'nutrition_history'
    id: Mapped[int] = mapped_column(primary_key=True)
    food_id: Mapped[int] = mapped_column(ForeignKey('foods.id'), index=True)
    values_per_100g: Mapped[dict] = mapped_column(JSON)
    source: Mapped[str] = mapped_column(String(240))
    source_version: Mapped[str] = mapped_column(String(80))
    changed_by_user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))


class ModelRun(Base, Timestamp):
    __tablename__ = 'model_runs'
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    version: Mapped[str] = mapped_column(String(80))
    dataset_version: Mapped[str] = mapped_column(String(120))
    preprocessing_version: Mapped[str] = mapped_column(String(80))
    stage: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(40))
    checkpoint_path: Mapped[str | None] = mapped_column(String(500))
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    class_mapping: Mapped[dict] = mapped_column(JSON, default=dict)
    notes: Mapped[str | None] = mapped_column(Text)


class DatasetRecord(Base, Timestamp):
    __tablename__ = 'dataset_records'
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    plate_id: Mapped[str] = mapped_column(String(120), index=True)
    image_path: Mapped[str] = mapped_column(String(500))
    pair_id: Mapped[str | None] = mapped_column(String(120), index=True)
    image_phase: Mapped[str] = mapped_column(String(12))
    split: Mapped[str] = mapped_column(String(10), index=True)
    annotations: Mapped[dict] = mapped_column(JSON, default=dict)
    metadata_json: Mapped[dict] = mapped_column('metadata', JSON, default=dict)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(
        String(80), default='second-serve-custom')
