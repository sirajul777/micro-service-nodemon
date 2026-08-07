"""Reseller domain (port of monolith BotResellerService)."""
import logging
from datetime import datetime

from db import get_session
from models import BotReseller, TopupLog

log = logging.getLogger("bot-py-service.reseller")


def _to_dict(r: BotReseller) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "username": r.username or "",
        "telegramId": r.telegramId,
        "sessionId": r.sessionId or "",
        "saldo": r.saldo or 0,
        "totalVoucher": r.totalVoucher or 0,
        "totalIncome": r.totalIncome or 0,
        "status": r.status or "active",
        "markup": r.markup or 0,
        "discount": r.discount or 0,
        "createdAt": r.createdAt.isoformat() if r.createdAt else "",
        "lastActive": r.lastActive or "",
        "note": r.note or "",
    }


def load_all():
    s = get_session()
    try:
        rows = s.query(BotReseller).all()
        return [_to_dict(r) for r in rows]
    finally:
        s.close()


def get_by_telegram_id(telegram_id):
    s = get_session()
    try:
        r = s.query(BotReseller).filter(BotReseller.telegramId == telegram_id).first()
        return _to_dict(r) if r else None
    finally:
        s.close()


def get_by_id(reseller_id):
    s = get_session()
    try:
        r = s.query(BotReseller).filter(BotReseller.id == reseller_id).first()
        return _to_dict(r) if r else None
    finally:
        s.close()


def upsert(data: dict):
    reseller_id = data.get("id") or f"RS-{int(datetime.now().timestamp() * 1000)}"
    s = get_session()
    try:
        row = s.query(BotReseller).filter(BotReseller.id == reseller_id).first()
        if not row:
            row = BotReseller(
                id=reseller_id,
                name=data.get("name", ""),
                username=data.get("username", ""),
                telegramId=data.get("telegramId", ""),
                sessionId=data.get("sessionId", ""),
                saldo=data.get("saldo", 0),
                totalVoucher=data.get("totalVoucher", 0),
                totalIncome=data.get("totalIncome", 0),
                status=data.get("status", "active"),
                markup=data.get("markup", 0),
                discount=data.get("discount", 0),
                lastActive=data.get("lastActive"),
                note=data.get("note", ""),
            )
            s.add(row)
        else:
            for k in ("name", "username", "telegramId", "sessionId", "saldo",
                      "totalVoucher", "totalIncome", "status", "markup",
                      "discount", "lastActive", "note"):
                if k in data:
                    setattr(row, k, data[k])
        s.commit()
        s.refresh(row)
        return _to_dict(row)
    finally:
        s.close()


def topup(reseller_id, amount, note, by):
    s = get_session()
    try:
        row = s.query(BotReseller).filter(BotReseller.id == reseller_id).first()
        if not row:
            return None
        before = row.saldo or 0
        row.saldo = before + amount
        s.add(TopupLog(
            reselerId=reseller_id,
            amount=amount,
            type="topup" if amount >= 0 else "deduct",
            note=note,
            by=by,
            balanceBefore=before,
            balanceAfter=row.saldo,
        ))
        s.commit()
        s.refresh(row)
        return {"reseller": _to_dict(row)}
    finally:
        s.close()


def deduct_saldo(telegram_id, amount, note):
    s = get_session()
    try:
        row = s.query(BotReseller).filter(BotReseller.telegramId == telegram_id).first()
        if not row or (row.saldo or 0) < amount:
            return False
        before = row.saldo or 0
        row.saldo = before - amount
        row.totalVoucher = (row.totalVoucher or 0) + 1
        row.totalIncome = (row.totalIncome or 0) + amount
        row.lastActive = datetime.now().isoformat()
        s.add(TopupLog(
            reselerId=row.id,
            amount=-amount,
            type="purchase",
            note=note,
            by="bot",
            balanceBefore=before,
            balanceAfter=row.saldo,
        ))
        s.commit()
        return True
    finally:
        s.close()


def load_logs(reseller_id=None, limit=100):
    s = get_session()
    try:
        q = s.query(TopupLog)
        if reseller_id:
            q = q.filter(TopupLog.reselerId == reseller_id)
        rows = q.order_by(TopupLog.id.desc()).limit(limit).all()
        return [
            {
                "id": r.id,
                "reselerId": r.reselerId,
                "amount": r.amount or 0,
                "type": r.type,
                "note": r.note,
                "by": r.by,
                "at": r.at.isoformat() if r.at else "",
                "balanceBefore": r.balanceBefore or 0,
                "balanceAfter": r.balanceAfter or 0,
            }
            for r in rows
        ]
    finally:
        s.close()
