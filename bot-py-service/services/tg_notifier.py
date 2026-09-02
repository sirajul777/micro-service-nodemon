"""Telegram notifications driven by configured bot instances.

Centralizes event-to-message formatting so Redis handlers can notify the
configured admin chat without duplicating Telegram API calls in each branch.
"""
from __future__ import annotations

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
    """Send a sale notification only to bots with notifSale enabled."""
    delivered = False
    order_id = payload.get("orderId", "")
    profile = payload.get("profile", "")
    amount = payload.get("amount", payload.get("uniqueAmount", 0))
    username = payload.get("username", "")
    for cfg in _enabled_configs():
        if not cfg.get("notifSale"):
            continue
        text = (
            "🛒 <b>Penjualan Baru</b>\n\n"
            f"Order: <code>{order_id}</code>\n"
            f"Profile: <b>{profile or '-'} </b>\n"
            f"Username: <code>{username or '-'}</code>\n"
            f"Nominal: <b>Rp {int(round(float(amount or 0))):,}</b>\n"
        )
        delivered = _send(cfg, text.replace(",", ".")) or delivered
    return delivered


def notify_payment_failed(payload: dict) -> bool:
    """Send admin failure alerts to every enabled bot admin chat."""
    delivered = False
    order_id = payload.get("orderId", "")
    reason = payload.get("reason", "unknown")
    for cfg in _enabled_configs():
        text = (
            "⚠️ <b>Pembayaran Gagal</b>\n\n"
            f"Order: <code>{order_id or '-'}</code>\n"
            f"Alasan: {reason}"
        )
        delivered = _send(cfg, text) or delivered
    return delivered


def notify_invoice_overdue(payload: dict) -> bool:
    """Send overdue billing alerts to enabled bot admin chats."""
    delivered = False
    invoice_id = payload.get("invoiceId", "")
    customer = payload.get("customerId", "")
    for cfg in _enabled_configs():
        text = (
            "⏰ <b>Invoice Jatuh Tempo</b>\n\n"
            f"Invoice: <code>{invoice_id or '-'}</code>\n"
            f"Pelanggan: <code>{customer or '-'}</code>"
        )
        delivered = _send(cfg, text) or delivered
    return delivered
