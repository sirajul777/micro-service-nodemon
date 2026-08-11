"""SQLAlchemy models for db_bot (bot-py-service).

Mirrors the monolith's entities: bot_resellers, topup_logs, telegram_configs.
"""
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Text, DateTime, func,
)
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class BotReseller(Base):
    __tablename__ = "bot_resellers"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    username = Column(String, nullable=True)
    telegramId = Column(String, nullable=False, index=True)
    sessionId = Column(String, nullable=True)
    saldo = Column(Float, default=0)
    totalVoucher = Column(Integer, default=0)
    totalIncome = Column(Float, default=0)
    status = Column(String, default="active")  # active | inactive
    markup = Column(Float, default=0)
    discount = Column(Float, default=0)
    createdAt = Column(DateTime, server_default=func.now())
    lastActive = Column(String, nullable=True)
    note = Column(String, nullable=True)


class Reseller(Base):
    """Plain price-discount reseller, tied to a router session — distinct
    from BotReseller (the Telegram-bot/saldo-based reseller system above).
    Mirrors the monolith's ResellerEntity (table `resellers`) exactly.
    These were previously (incorrectly) served from the BotReseller table,
    which meant a plain reseller's `phone`/`address` were silently dropped
    (BotReseller has no such columns) and the two feature's data was mixed
    together in both listings.
    """
    __tablename__ = "resellers"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    discount = Column(Float, default=0)
    createdAt = Column(DateTime, server_default=func.now())
    router = Column(String, nullable=True)


class TopupLog(Base):
    __tablename__ = "topup_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    reselerId = Column(String, nullable=False)
    amount = Column(Float, default=0)
    type = Column(String, nullable=False)  # topup | deduct | purchase
    note = Column(String, nullable=True)
    by = Column(String, nullable=True)
    at = Column(DateTime, server_default=func.now())
    balanceBefore = Column(Float, default=0)
    balanceAfter = Column(Float, default=0)


class TelegramConfig(Base):
    __tablename__ = "telegram_configs"

    id = Column(String, primary_key=True)
    token = Column(String, nullable=False)
    chatId = Column(String, nullable=False)
    sessionId = Column(String, nullable=False, index=True)
    notifSale = Column(Boolean, default=True)
    notifDaily = Column(Boolean, default=False)
    dailyTime = Column(String, default="23:59")
    botEnabled = Column(Boolean, default=True)
    allowedUsers = Column(Text, nullable=True)  # JSON array string
    defaultProfile = Column(String, default="")
    welcomeMsg = Column(String, default="")
