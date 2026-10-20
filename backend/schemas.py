from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Literal
import re


class Strict(BaseModel):
    model_config = ConfigDict(
        extra='forbid', allow_inf_nan=False, str_strip_whitespace=True)


class Register(Strict):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(max_length=254)
    password: str = Field(min_length=10, max_length=128)
    organization: str = Field(default='My workspace',
                              min_length=2, max_length=120)

    @field_validator('email')
    @classmethod
    def email_valid(cls, v):
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', v):
            raise ValueError('Enter a valid email address')
        return v.lower()


class Login(Strict):
    email: str
    password: str = Field(max_length=128)
    remember: bool = False


class Analyze(Strict):
    before_id: str
    after_id: str
    meal_type: Literal['Breakfast', 'Lunch', 'Dinner', 'Snacks'] = 'Lunch'
    location_id: int | None = None
    served_grams: float = Field(default=500, gt=0, le=10000)


class FoodInput(Strict):
    name: str = Field(min_length=1, max_length=80)
    category: str = Field(min_length=1, max_length=80)
    standard_portion: float = Field(default=200, gt=0, le=10000)
    cost_per_kg: float = Field(default=0, ge=0, le=1000000)
    impact_factor: dict = Field(default_factory=dict)
    nutrition_per_100g: dict = Field(default_factory=dict)
    nutrition_source: str | None = Field(default=None, max_length=240)
    nutrition_source_version: str | None = Field(default=None, max_length=80)

    @field_validator('impact_factor')
    @classmethod
    def factor(cls, v):
        import math
        for key, item in v.items():
            if key not in ['co2e', 'water', 'economic'] or not isinstance(item, dict):
                raise ValueError('Unsupported factor')
            if not all(item.get(k) for k in ['unit', 'source', 'version']):
                raise ValueError(
                    'Factors require unit, source and version/date')
            value = item.get('value')
            if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise ValueError('Invalid factor value')
        return v

    @field_validator('nutrition_per_100g')
    @classmethod
    def nutrition_valid(cls, v):
        import math
        allowed = {'calories_kcal', 'protein_g', 'carbs_g',
                   'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg'}
        if any(key not in allowed for key in v):
            raise ValueError('Unsupported nutrition nutrient')
        for value in v.values():
            if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise ValueError(
                    'Nutrition values must be finite, non-negative values per 100 g')
        return v


class CorrectFood(Strict):
    food_id: int | None = None
    label: str = Field(min_length=1, max_length=100)
    initial_quantity: float = Field(ge=0, le=10000)
    remaining_quantity: float = Field(ge=0, le=10000)
    confidence: float = Field(ge=0, le=1)
    geometry: dict = Field(default_factory=dict)

    @field_validator('geometry')
    @classmethod
    def polygons(cls, v):
        for key in ['polygons', 'after_polygons']:
            polygons = v.get(key, [])
            if len(polygons) > 30:
                raise ValueError('Too many polygons')
            for polygon in polygons:
                if not 3 <= len(polygon) <= 500:
                    raise ValueError('A polygon needs 3–500 points')
                for p in polygon:
                    if len(p) != 2 or not all(isinstance(x, (int, float)) and 0 <= x <= 1 for x in p):
                        raise ValueError('Coordinates must be between 0 and 1')
        return v


class CorrectionInput(Strict):
    analysis_id: str
    foods: list[CorrectFood] = Field(min_length=1, max_length=30)
    reason: str = Field(min_length=3, max_length=500)
    verified: bool = False


class SettingsInput(Strict):
    name: str = Field(min_length=2, max_length=100)
    theme: Literal['dark', 'light'] = 'dark'
    notifications: bool = True
    performance: bool = False
    reduce_motion: bool = False
    confidence_threshold: float = Field(default=.75, ge=.1, le=1)
    waste_threshold: float = Field(default=30, ge=1, le=100)


class PlaceInput(Strict):
    name: str = Field(min_length=2, max_length=120)
    cafeteria_id: int | None = None


class UserUpdate(Strict):
    role: Literal['USER', 'CAFETERIA_MANAGER',
                  'ORGANIZATION_ADMIN', 'SUPER_ADMIN']
    cafeteria_id: int | None = None


class InviteUser(Register):
    role: Literal['USER', 'CAFETERIA_MANAGER', 'ORGANIZATION_ADMIN'] = 'USER'
    cafeteria_id: int | None = None
    organization_id: int | None = None


class ResetRequest(Strict):
    email: str = Field(max_length=254)


class ResetPassword(Strict):
    token: str = Field(max_length=200)
    password: str = Field(min_length=10, max_length=128)


class FitnessProfileInput(Strict):
    age: int | None = Field(default=None, ge=13, le=120)
    height_cm: float | None = Field(default=None, ge=80, le=260)
    weight_kg: float | None = Field(default=None, ge=20, le=400)
    activity_level: Literal['sedentary', 'light',
                            'moderate', 'high', 'very_high'] | None = None
    fitness_goal: Literal['MAINTAIN', 'BUILD_MUSCLE',
                          'GENERAL_FITNESS', 'REDUCE_WASTE'] | None = None


class NutritionInput(Strict):
    nutrition_per_100g: dict
    nutrition_source: str = Field(min_length=2, max_length=240)
    nutrition_source_version: str = Field(min_length=1, max_length=80)

    @field_validator('nutrition_per_100g')
    @classmethod
    def nutrition_valid(cls, v):
        return FoodInput.nutrition_valid(v)
