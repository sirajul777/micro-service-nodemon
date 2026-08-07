"""Thin Telegram Bot API client (sendMessage, getUpdates, etc.).

Port of the monolith's `apiCall` (https to api.telegram.org) using `requests`.
"""
import logging

import requests

log = logging.getLogger("bot-py-service.tg-api")

API_BASE = "https://api.telegram.org"


def api_call(token: str, method: str, body: dict | None = None):
    url = f"{API_BASE}/bot{token}/{method}"
    try:
        resp = requests.post(url, json=body or {}, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        log.error(f"telegram {method} error: {e}")
        return {"ok": False, "description": str(e)}


def send_message(token: str, chat_id, text: str, extra=None):
    body = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if extra:
        body.update(extra)
    return api_call(token, "sendMessage", body)


def edit_message(token: str, chat_id, message_id, text: str, extra=None):
    body = {
        "chat_id": chat_id,
        "message_id": message_id,
        "text": text,
        "parse_mode": "HTML",
    }
    if extra:
        body.update(extra)
    return api_call(token, "editMessageText", body)


def answer_callback(token: str, callback_query_id, text: str = ""):
    return api_call(
        token,
        "answerCallbackQuery",
        {"callback_query_id": callback_query_id, "text": text, "show_alert": False},
    )


def get_updates(token: str, offset: int, timeout: int = 25):
    return api_call(
        token,
        "getUpdates",
        {
            "offset": offset,
            "timeout": timeout,
            "allowed_updates": ["message", "callback_query"],
        },
    )
