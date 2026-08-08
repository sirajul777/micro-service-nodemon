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


def send_voucher_wa(opts: dict, wa_provider="fonnte", wa_token="", wa_domain="") -> bool:
    """Send voucher via WA gateway. Falls back to logging a wa.me link.

    Returns True only if the message was actually accepted by the gateway.
    No phone number, or WA not configured, are not failures — those are
    deliberate no-ops (there's nowhere/no way to send), so they return True
    and the caller can safely ack the event. An actual send attempt that
    fails (network error, non-2xx, or the gateway's own body saying it
    rejected the message) returns False so the caller does NOT ack — the
    event stays pending and gets retried instead of the voucher silently
    never reaching the customer.
    """
    phone = opts.get("phone", "")
    if not phone:
        log.info(f"[VOUCHER] {opts.get('voucherName')} → {opts.get('username')}/{opts.get('password')} (no phone)")
        return True

    message = build_voucher_message(opts)
    wa_link = f"https://wa.me/{normalize_phone(phone)}?text={urllib.parse.quote(message)}"

    if not wa_token:
        log.info(f"[VOUCHER] WA not configured — fallback link: {wa_link}")
        return True

    norm_phone = normalize_phone(phone)
    try:
        if wa_provider == "wablas":
            base = (wa_domain or "https://console.wablas.com").rstrip("/")
            resp = requests.post(
                f"{base}/api/send-message",
                json={"phone": norm_phone, "message": message},
                headers={"Authorization": wa_token},
                timeout=15,
            )
        else:
            resp = requests.post(
                "https://api.fonnte.com/send",
                json={"target": norm_phone, "message": message},
                headers={"Authorization": wa_token},
                timeout=15,
            )
        resp.raise_for_status()

        # A 200 response isn't enough on its own — both Fonnte and Wablas
        # can return HTTP 200 with a body indicating the send was actually
        # rejected (bad token, out of quota, invalid number, etc).
        try:
            body = resp.json()
        except ValueError:
            body = {}
        if isinstance(body, dict) and body.get("status") is False:
            reason = body.get("reason") or body.get("message") or "gateway reported failure"
            raise RuntimeError(f"{wa_provider} rejected the message: {reason}")

        log.info(f"[VOUCHER] WhatsApp sent to {norm_phone} via {wa_provider}")
        return True
    except Exception as e:
        log.error(f"[VOUCHER] WA send failed: {e}. Fallback: {wa_link}")
        return False
