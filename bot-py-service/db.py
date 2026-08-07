"""bot-py-service database session management (SQLAlchemy + Postgres)."""
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session

from config import DATABASE_URL
from models import Base

log = logging.getLogger("bot-py-service.db")

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=3600)
SessionLocal = scoped_session(sessionmaker(bind=engine, autoflush=False, autocommit=False))


def init_db():
    """Create tables if they don't exist (dev convenience)."""
    Base.metadata.create_all(bind=engine)
    log.info("db_bot schema ensured (bot_resellers, topup_logs, telegram_configs)")


def get_session():
    return SessionLocal()
