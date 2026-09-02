"""Telegram notifications driven by configured bot instances.

Centralizes event-to-message formatting so Redis handlers can notify the
configured admin chat without duplicating Telegram API calls in each branch.
"""
from __future__ import annotations

import html
import logging

from services import tg_api, tg_config_service as tg_cfg

log = logging.getLogger("bot-py-service.tg-notifier")


def _enabled_configs() -> list[dict]:
    return [cfg for cfg in tg_cfg.load_all() if cfg.get("botEnabled") and cfg.get("token") and cfg.get("chatId")]


def _send(cfg: dict, text: str) -> bool:
    try:
        result = tg_api.send_message(cfg.get("token", ""), cfg.get("chatId", ""), text)
        return bool(result.get("ok")) if isinstance(result, dict) else bool(result)
    except Exception as exc:
        log.warning("Telegram notification failed for config %s: %s", cfg.get("id", ""), exc)
        return False


def notify_sale(payload: dict) -> bool:
    """Send a single sale notification to bots with notifSale enabled.

    ``payment.order.paid`` and ``payment.order.settled`` are emitted for the
    same order during settlement. The consumer calls this helper from both
    paths, so the order id is used as a short-lived de-duplication key.
    """
    delivered = False
    order_id = str(payload.get("orderId", "")).strip()
    profile = html.escape(str(payload.get("profile", "") or "-"))
    amount = payload.get("amount", payload.get("uniqueAmount", 0))
    username = html.escape(str(payload.get("username", "") or "-"))
    amount_text = f"Rp {int(round(float(amount or 0))):,}".replace(",", ".")

    for cfg in _enabled_configs():
        if not cfg.get("notifSale"):
            continue
        key = f"{cfg.get('id', '')}:{order_id}"
        if _sale_already_notified(key):
            continue
        text = (
            "🛒 <b>Penjualan Baru</b>\n\n"
            f"Order: <code>{html.escape(order_id or '-')}</code>\n"
            f"Profile: <b>{profile}</b>\n"
            f"Username: <code>{username}</code>\n"
            f"Nominal: <b>{amount_text}</b>\n"
        )
        if _send(cfg, text):
            _mark_sale_notified(key)
            delivered = True
    return delivered


def _sale_already_notified(key: str) -> bool:
    return key in _sale_dedupe


def _mark_sale_notified(key: str) -> None:
    _sale_dedupe[key] = __import__("time").monotonic()
    _prune_sale_dedupe()


def _prune_sale_dedupe() -> None:
    now = __import__("time").monotonic()
    expired = [key for key, ts in _sale_dedupe.items() if now - ts > _SALE_DEDUPE_TTL]
    for key in expired:
        _sale_dedupe.pop(key, None)


_SALE_DEDUPE_TTL = 10 * 60
_sale_dedupe: dict[str, float] = {}


def notify_payment_failed(payload: dict) -> bool:
    """Send admin failure alerts to every enabled bot admin chat."""
    delivered = False
    order_id = html.escape(str(payload.get("orderId", "") or "-"))
    reason = html.escape(str(payload.get("reason", "unknown") or "unknown"))
    for cfg in _enabled_configs():
        text = (
            "⚠️ <b>Pembayaran Gagal</b>\n\n"
            f"Order: <code>{order_id}</code>\n"
            f"Alasan: {reason}"
        )
        delivered = _send(cfg, text) or delivered
    return delivered


def notify_invoice_overdue(payload: dict) -> bool:
    """Send overdue billing alerts to enabled bot admin chats."""
    delivered = False
    invoice_id = html.escape(str(payload.get("invoiceId", "") or "-"))
    customer = html.escape(str(payload.get("customerId", "") or "-"))
    for cfg in _enabled_configs():
        text = (
            "⏰ <b>Invoice Jatuh Tempo</b>\n\n"
            f"Invoice: <code>{invoice_id}</code>\n"
            f"Pelanggan: <code>{customer}</code>"
        )
        delivered = _send(cfg, text) or delivered
    return delivered
