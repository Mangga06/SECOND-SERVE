"""fit nutrition snapshots and reproducible model registry

Revision ID: 002_fit_and_training
Revises: 001_initial
"""
from alembic import op
import sqlalchemy as sa

revision = '002_fit_and_training'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('foods', sa.Column(
        'nutrition_per_100g', sa.JSON(), nullable=True))
    op.add_column('foods', sa.Column(
        'nutrition_source', sa.String(240), nullable=True))
    op.add_column('foods', sa.Column(
        'nutrition_source_version', sa.String(80), nullable=True))
    op.add_column('foods', sa.Column('nutrition_updated_at',
                  sa.DateTime(timezone=True), nullable=True))
    op.add_column('food_analyses', sa.Column(
        'nutrition', sa.JSON(), nullable=True))
    op.create_table('fitness_profiles', sa.Column('id', sa.Integer(), primary_key=True), sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False, unique=True), sa.Column('age', sa.Integer()), sa.Column('height_cm', sa.Float(
    )), sa.Column('weight_kg', sa.Float()), sa.Column('activity_level', sa.String(40)), sa.Column('fitness_goal', sa.String(40)), sa.Column('updated_at', sa.DateTime(timezone=True)), sa.Column('created_at', sa.DateTime(timezone=True)))
    op.create_table('nutrition_history', sa.Column('id', sa.Integer(), primary_key=True), sa.Column('food_id', sa.Integer(), sa.ForeignKey('foods.id'), nullable=False), sa.Column('values_per_100g', sa.JSON(), nullable=False), sa.Column(
        'source', sa.String(240), nullable=False), sa.Column('source_version', sa.String(80), nullable=False), sa.Column('changed_by_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False), sa.Column('created_at', sa.DateTime(timezone=True)))
    op.create_table('model_runs', sa.Column('id', sa.String(80), primary_key=True), sa.Column('name', sa.String(120), nullable=False), sa.Column('version', sa.String(80), nullable=False), sa.Column('dataset_version', sa.String(120), nullable=False), sa.Column('preprocessing_version', sa.String(80), nullable=False), sa.Column(
        'stage', sa.String(40), nullable=False), sa.Column('status', sa.String(40), nullable=False), sa.Column('checkpoint_path', sa.String(500)), sa.Column('metrics', sa.JSON()), sa.Column('class_mapping', sa.JSON()), sa.Column('notes', sa.Text()), sa.Column('created_at', sa.DateTime(timezone=True)))
    op.create_table('dataset_records', sa.Column('id', sa.String(80), primary_key=True), sa.Column('plate_id', sa.String(120), nullable=False), sa.Column('image_path', sa.String(500), nullable=False), sa.Column('pair_id', sa.String(120)), sa.Column('image_phase', sa.String(12), nullable=False), sa.Column(
        'split', sa.String(10), nullable=False), sa.Column('annotations', sa.JSON()), sa.Column('metadata', sa.JSON()), sa.Column('verified', sa.Boolean(), nullable=False), sa.Column('source', sa.String(80), nullable=False), sa.Column('created_at', sa.DateTime(timezone=True)))


def downgrade():
    op.drop_table('dataset_records')
    op.drop_table('model_runs')
    op.drop_table('nutrition_history')
    op.drop_table('fitness_profiles')
    op.drop_column('food_analyses', 'nutrition')
    for column in ['nutrition_updated_at', 'nutrition_source_version', 'nutrition_source', 'nutrition_per_100g']:
        op.drop_column('foods', column)
