"""WhatsApp delivery for voucher credentials (Fonnte / Wablas).

Port of the monolith's PayhookNotifierService.sendVoucherToCustomer().
Sends the voucher (username/password) to the customer via a WhatsApp gateway.

If WhatsApp sending is disabled or fails, logs a `wa.me` deep-link fallback.
"""
import logging
import re
import urllib.parse

import requests

log = logging.getLogger("bot-py-service.notifier")


def normalize_phone(phone: str) -> str:
    p = re.sub(r"[^0-9]", "", phone)
    if p.startswith("0"):
        p = "62" + p[1:]
    if not p.startswith("62"):
        p = "62" + p
    return p


def build_voucher_message(opts: dict) -> str:
    lines = [
        f"🎟️ *{opts.get('voucherName', 'Voucher WiFi')}*",
        "",
        f"👤 Username: {opts.get('username', '')}",
        f"🔑 Password: {opts.get('password', '')}",
        f"📦 Profile: {opts.get('profile', '')}",
    ]
    validity = opts.get("validity", "")
    if validity:
        lines.append(f"⏰ Masa aktif: {validity}")
    lines.extend(["", "Terima kasih telah berbelanja!"])
    return "\n".join(lines)


def send_voucher_wa(opts: dict, wa_provider="fonnte", wa_token="", wa_domain=""):
    """Send voucher via WA gateway. Falls back to logging a wa.me link."""
    phone = opts.get("phone", "")
    if not phone:
        log.info(f"[VOUCHER] {opts.get('voucherName')} → {opts.get('username')}/{opts.get('password')} (no phone)")
        return

    message = build_voucher_message(opts)
    wa_link = f"https://wa.me/{normalize_phone(phone)}?text={urllib.parse.quote(message)}"

    if not wa_token:
        log.info(f"[VOUCHER] WA not configured — fallback link: {wa_link}")
        return

    norm_phone = normalize_phone(phone)
    try:
        if wa_provider == "wablas":
            base = (wa_domain or "https://console.wablas.com").rstrip("/")
            requests.post(
                f"{base}/api/send-message",
                json={"phone": norm_phone, "message": message},
                headers={"Authorization": wa_token},
                timeout=15,
            )
        else:
            requests.post(
                "https://api.fonnte.com/send",
                json={"target": norm_phone, "message": message},
                headers={"Authorization": wa_token},
                timeout=15,
            )
        log.info(f"[VOUCHER] WhatsApp sent to {norm_phone} via {wa_provider}")
    except Exception as e:
        log.error(f"[VOUCHER] WA send failed: {e}. Fallback: {wa_link}")
