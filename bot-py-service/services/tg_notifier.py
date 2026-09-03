"""Telegram notifications driven by configured bot instances."""
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


def _send_to_config(cfg: dict, chat_id: str, text: str) -> bool:
    try:
        result = tg_api.send_message(cfg.get("token", ""), chat_id, text)
        return bool(result.get("ok")) if isinstance(result, dict) else bool(result)
    except Exception as exc:
        log.warning("Telegram targeted notification failed for config %s: %s", cfg.get("id", ""), exc)
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
            f"Order: <code>{html.escape(str(order_id))}</code>\n"
            f"Profile: <b>{html.escape(str(profile or '-'))}</b>\n"
            f"Username: <code>{html.escape(str(username or '-'))}</code>\n"
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
            f"Order: <code>{html.escape(str(order_id or '-'))}</code>\n"
            f"Alasan: {html.escape(str(reason))}"
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
            f"Invoice: <code>{html.escape(str(invoice_id or '-'))}</code>\n"
            f"Pelanggan: <code>{html.escape(str(customer or '-'))}</code>"
        )
        delivered = _send(cfg, text) or delivered
    return delivered


def notify_invoice_reminder(payload: dict) -> bool:
    """Send a billing reminder to the customer's Telegram chat."""
    chat_id = str(payload.get("telegramId") or "").strip()
    session_id = str(payload.get("sessionId") or "").strip()
    if not chat_id:
        return False

    customer = html.escape(str(payload.get("customerName") or "Pelanggan"))
    invoice_id = html.escape(str(payload.get("invoiceId") or "-"))
    due_date = html.escape(str(payload.get("dueDate") or "-"))
    days_left = int(payload.get("daysLeft") or 0)
    amount = int(round(float(payload.get("amount") or 0)))
    if days_left >= 0:
        day_line = f"{days_left} hari lagi"
    else:
        day_line = f"{abs(days_left)} hari terlambat"
    text = (
        "🔔 <b>Pengingat Tagihan Internet</b>\n\n"
        f"Pelanggan: <b>{customer}</b>\n"
        f"Invoice: <code>{invoice_id}</code>\n"
        f"Tagihan: <b>Rp {amount:,}</b>\n"
        f"Jatuh tempo: <b>{due_date}</b>\n"
        f"Status: <b>{day_line}</b>"
    ).replace(",", ".")

    candidates = [
        cfg for cfg in tg_cfg.load_all()
        if cfg.get("botEnabled") and cfg.get("token")
        and (not session_id or str(cfg.get("sessionId") or "") == session_id)
    ]
    for cfg in candidates:
        if _send_to_config(cfg, chat_id, text):
            return True
    return False
