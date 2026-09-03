"""Reseller domain (port of monolith BotResellerService)."""
import logging
from datetime import datetime

from sqlalchemy import and_, func

from db import get_session
from models import BotReseller, Reseller, TopupLog

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
    """Atomically debit a reseller balance and record the purchase ledger."""
    amount = float(amount or 0)
    if amount <= 0:
        return False

    s = get_session()
    try:
        row = s.query(BotReseller).filter(BotReseller.telegramId == telegram_id).first()
        if not row:
            return False

        before = float(row.saldo or 0)
        affected = (
            s.query(BotReseller)
            .filter(and_(BotReseller.id == row.id, BotReseller.saldo >= amount))
            .update(
                {
                    BotReseller.saldo: BotReseller.saldo - amount,
                    BotReseller.totalVoucher: func.coalesce(BotReseller.totalVoucher, 0) + 1,
                    BotReseller.totalIncome: func.coalesce(BotReseller.totalIncome, 0) + amount,
                    BotReseller.lastActive: datetime.now().isoformat(),
                },
                synchronize_session=False,
            )
        )
        if affected != 1:
            s.rollback()
            return False

        after = before - amount
        s.add(TopupLog(
            reselerId=row.id,
            amount=-amount,
            type="purchase",
            note=note,
            by="bot",
            balanceBefore=before,
            balanceAfter=after,
        ))
        s.commit()
        return True
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


def refund_saldo(telegram_id, amount, note):
    """Atomically refund a previously charged voucher purchase."""
    amount = float(amount or 0)
    if amount <= 0:
        return False

    s = get_session()
    try:
        row = s.query(BotReseller).filter(BotReseller.telegramId == telegram_id).first()
        if not row:
            return False

        before = float(row.saldo or 0)
        affected = (
            s.query(BotReseller)
            .filter(BotReseller.id == row.id)
            .update(
                {
                    BotReseller.saldo: BotReseller.saldo + amount,
                    BotReseller.totalVoucher: func.greatest(func.coalesce(BotReseller.totalVoucher, 0) - 1, 0),
                    BotReseller.totalIncome: func.greatest(func.coalesce(BotReseller.totalIncome, 0) - amount, 0),
                    BotReseller.lastActive: datetime.now().isoformat(),
                },
                synchronize_session=False,
            )
        )
        if affected != 1:
            s.rollback()
            return False

        after = before + amount
        s.add(TopupLog(
            reselerId=row.id,
            amount=amount,
            type="refund",
            note=note,
            by="system",
            balanceBefore=before,
            balanceAfter=after,
        ))
        s.commit()
        return True
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


def delete(reseller_id) -> bool:
    """Hard-delete a bot-reseller."""
    s = get_session()
    try:
        row = s.query(BotReseller).filter(BotReseller.id == reseller_id).first()
        if not row:
            return False
        s.delete(row)
        s.commit()
        return True
    finally:
        s.close()


def _to_dict_plain(r: Reseller) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "phone": r.phone or "",
        "address": r.address or "",
        "discount": r.discount or 0,
        "createdAt": r.createdAt.isoformat() if r.createdAt else "",
        "router": r.router or "",
    }


def load_all_plain():
    s = get_session()
    try:
        return [_to_dict_plain(r) for r in s.query(Reseller).all()]
    finally:
        s.close()


def load_by_router(router: str):
    s = get_session()
    try:
        rows = s.query(Reseller).filter(Reseller.router == router).all()
        return [_to_dict_plain(r) for r in rows]
    finally:
        s.close()


def get_plain_by_id(reseller_id):
    s = get_session()
    try:
        r = s.query(Reseller).filter(Reseller.id == reseller_id).first()
        return _to_dict_plain(r) if r else None
    finally:
        s.close()


def upsert_plain(data: dict):
    reseller_id = data.get("id")
    if not reseller_id:
        import re as _re
        reseller_id = _re.sub(r"[^A-Z0-9]", "_", (data.get("name") or "").upper())[:20]

    s = get_session()
    try:
        row = s.query(Reseller).filter(Reseller.id == reseller_id).first()
        if not row:
            row = Reseller(
                id=reseller_id,
                name=data.get("name", ""),
                phone=data.get("phone", ""),
                address=data.get("address", ""),
                discount=data.get("discount", 0),
                router=data.get("router", ""),
            )
            s.add(row)
        else:
            row.name = data.get("name", row.name)
            row.phone = data.get("phone", row.phone)
            row.address = data.get("address", row.address)
            row.discount = data.get("discount", row.discount)
            row.router = data.get("router", row.router)
        s.commit()
        s.refresh(row)
        return _to_dict_plain(row)
    finally:
        s.close()


def delete_plain(reseller_id) -> bool:
    s = get_session()
    try:
        row = s.query(Reseller).filter(Reseller.id == reseller_id).first()
        if not row:
            return False
        s.delete(row)
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
