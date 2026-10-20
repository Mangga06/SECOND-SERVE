import os
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATA = Path(os.getenv('DATA_DIR', 'data')).resolve()
DATA.mkdir(parents=True, exist_ok=True)
(DATA / 'images').mkdir(exist_ok=True)
URL = os.getenv('DATABASE_URL', f'sqlite:///{DATA / "secondserve.db"}')
engine = create_engine(URL, connect_args={'check_same_thread': False} if URL.startswith(
    'sqlite') else {}, pool_pre_ping=True)
if URL.startswith('sqlite'):
    @event.listens_for(engine, 'connect')
    def sqlite_config(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')
        connection.execute('PRAGMA journal_mode=WAL')
Session = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    with Session() as db:
        yield db
