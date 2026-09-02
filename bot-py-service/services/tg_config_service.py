"""Telegram config + topup-request persistence (db-backed)."""
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
        log.info(f"Saved telegram config {cfg['id']}")
    finally:
        s.close()


def delete_config(config_id: str):
    s = get_session()
    try:
        row = s.query(TelegramConfig).filter(TelegramConfig.id == config_id).first()
        if row:
            s.delete(row)
            s.commit()
            log.info(f"Deleted telegram config {config_id}")
    finally:
        s.close()


# ── Topup requests (Postgres-backed; survive service restart) ─────

def _topup_to_dict(r: TelegramTopupRequest) -> dict:
    return {
        "id": r.id,
        "resellerId": r.resellerId,
        "resellerName": r.resellerName,
        "telegramId": r.telegramId,
        "amount": r.amount or 0,
        "note": r.note or "",
        "status": r.status or "pending",
        "createdAt": r.createdAt.isoformat() if r.createdAt else "",
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
            telegramId=str(req.get("telegramId", "")),
            amount=float(req.get("amount", 0) or 0),
            note=req.get("note", ""),
            status=req.get("status", "pending"),
        )
        s.merge(row)
        s.commit()
    finally:
        s.close()


def load_topup_requests() -> list[dict]:
    s = get_session()
    try:
        rows = (
            s.query(TelegramTopupRequest)
            .order_by(TelegramTopupRequest.createdAt.desc())
            .limit(100)
            .all()
        )
        return [_topup_to_dict(r) for r in rows]
    finally:
        s.close()


def save_topup_requests(reqs: list[dict]):
    """Persist changed request states without rewriting/deleting history."""
    s = get_session()
    try:
        for req in reqs:
            row = s.query(TelegramTopupRequest).filter(TelegramTopupRequest.id == req.get("id")).first()
            if not row:
                continue
            row.status = req.get("status", row.status)
            if req.get("processedBy"):
                row.processedBy = req["processedBy"]
            elif row.status in ("approved", "rejected") and not row.processedBy:
                row.processedBy = "Telegram Admin"
            if row.status in ("approved", "rejected") and not row.processedAt:
                row.processedAt = datetime.now()
        s.commit()
    finally:
        s.close()
