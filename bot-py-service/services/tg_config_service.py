"""TelegramConfig persistence + topup-request store (db-backed).

Replaces the monolith's file-based telegram.json / topup-requests.json with
rows in db_bot. Also keeps an in-memory copy of topup requests (mirroring the
monolith's JSON file behavior) since they're lightweight.
"""
import json
import logging
from datetime import datetime

from db import get_session
from models import TelegramConfig

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


# ── Topup requests (in-memory, mirrors monolith's topup-requests.json) ──
_topup_requests: list[dict] = []


def add_topup_request(req: dict):
    _topup_requests.insert(0, req)
    if len(_topup_requests) > 100:
        del _topup_requests[100:]


def load_topup_requests():
    return list(_topup_requests)


def save_topup_requests(reqs: list[dict]):
    global _topup_requests
    _topup_requests = reqs
