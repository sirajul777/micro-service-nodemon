"""Telegram configuration and persistent topup-request store."""
import json
import logging
from datetime import datetime

from db import get_session
from models import TelegramConfig, TelegramTopupRequest

log = logging.getLogger("bot-py-service.tg-config")


def _cfg_to_dict(c: TelegramConfig) -> dict:
    allowed = []
    try:
        allowed = json.loads(c.allowedUsers) if c.allowedUsers else []
    except (TypeError, ValueError):
        allowed = []
    return {
        "id": c.id,
        "token": c.token,
        "chatId": c.chatId,
        "sessionId": c.sessionId,
        "notifSale": c.notifSale if c.notifSale is not None else True,
        "notifDaily": c.notifDaily if c.notifDaily is not None else False,
        "dailyTime": c.dailyTime or "23:59",
        "botEnabled": c.botEnabled if c.botEnabled is not None else True,
        "allowedUsers": allowed,
        "defaultProfile": c.defaultProfile or "",
        "welcomeMsg": c.welcomeMsg or "",
    }


def load_all() -> list[dict]:
    s = get_session()
    try:
        rows = s.query(TelegramConfig).all()
        return [_cfg_to_dict(r) for r in rows]
    finally:
        s.close()


def get_config(config_id: str | None = None) -> dict | None:
    all_cfgs = load_all()
    if not all_cfgs:
        return None
    if not config_id:
        return all_cfgs[0]
    for c in all_cfgs:
        if c["id"] == config_id:
            return c
    return None


def save_config(cfg: dict):
    s = get_session()
    try:
        row = s.query(TelegramConfig).filter(TelegramConfig.id == cfg["id"]).first()
        if not row:
            row = TelegramConfig(id=cfg["id"])
            s.add(row)
        row.token = cfg.get("token", "")
        row.chatId = cfg.get("chatId", "")
        row.sessionId = cfg.get("sessionId", "")
        row.notifSale = cfg.get("notifSale", True)
        row.notifDaily = cfg.get("notifDaily", False)
        row.dailyTime = cfg.get("dailyTime", "23:59")
        row.botEnabled = cfg.get("botEnabled", True)
        row.allowedUsers = json.dumps(cfg.get("allowedUsers", []))
        row.defaultProfile = cfg.get("defaultProfile", "")
        row.welcomeMsg = cfg.get("welcomeMsg", "")
        s.commit()
        log.info("Saved telegram config %s", cfg["id"])
    finally:
        s.close()


def delete_config(config_id: str):
    s = get_session()
    try:
        row = s.query(TelegramConfig).filter(TelegramConfig.id == config_id).first()
        if row:
            s.delete(row)
            s.commit()
            log.info("Deleted telegram config %s", config_id)
    finally:
        s.close()


def _topup_to_dict(r: TelegramTopupRequest) -> dict:
    return {
        "id": r.id,
        "resellerId": r.resellerId,
        "resellerName": r.resellerName,
        "telegramId": r.telegramId,
        "amount": r.amount or 0,
        "note": r.note or "",
        "status": r.status,
        "requestedAt": r.requestedAt.isoformat() if r.requestedAt else "",
        "processedAt": r.processedAt.isoformat() if r.processedAt else "",
        "processedBy": r.processedBy or "",
    }


def add_topup_request(req: dict):
    s = get_session()
    try:
        row = TelegramTopupRequest(
            id=req["id"],
            resellerId=req.get("resellerId", ""),
            resellerName=req.get("resellerName", ""),
            telegramId=req.get("telegramId", ""),
            amount=float(req.get("amount", 0)),
            note=req.get("note", ""),
            status=req.get("status", "pending"),
        )
        if req.get("requestedAt"):
            row.requestedAt = datetime.fromisoformat(str(req["requestedAt"]).replace("Z", "+00:00")).replace(tzinfo=None)
        s.add(row)
        s.commit()
    finally:
        s.close()


def load_topup_requests(limit: int = 100):
    s = get_session()
    try:
        rows = (
            s.query(TelegramTopupRequest)
            .order_by(TelegramTopupRequest.requestedAt.desc())
            .limit(limit)
            .all()
        )
        return [_topup_to_dict(r) for r in rows]
    finally:
        s.close()


def get_topup_request(req_id: str):
    s = get_session()
    try:
        row = s.query(TelegramTopupRequest).filter(TelegramTopupRequest.id == req_id).first()
        return _topup_to_dict(row) if row else None
    finally:
        s.close()


def claim_topup_request(req_id: str, processor: str) -> dict | None:
    """Atomically transition pending -> processing.

    Exactly one concurrent admin can claim a request. The caller should only
    credit the reseller after receiving this row, then finalize its status.
    """
    s = get_session()
    try:
        row = (
            s.query(TelegramTopupRequest)
            .filter(
                TelegramTopupRequest.id == req_id,
                TelegramTopupRequest.status == "pending",
            )
            .with_for_update()
            .first()
        )
        if not row:
            s.rollback()
            return None
        row.status = "processing"
        row.processedBy = processor
        s.commit()
        return _topup_to_dict(row)
    finally:
        s.close()


def finish_topup_request(req_id: str, status: str, processor: str, *, note: str | None = None) -> bool:
    if status not in {"approved", "rejected", "pending"}:
        raise ValueError("invalid topup request status")
    s = get_session()
    try:
        row = s.query(TelegramTopupRequest).filter(TelegramTopupRequest.id == req_id).first()
        if not row:
            return False
        row.status = status
        row.processedBy = processor
        row.processedAt = datetime.now()
        if note is not None:
            row.note = note
        s.commit()
        return True
    finally:
        s.close()
