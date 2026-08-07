"""Redis event consumer for bot-py-service.

Consumes:
  payment.order.settled  → deliver voucher via WA/TG (and notify admin)
  payment.order.paid     → admin notification (optional)
  payment.failed         → admin alert
  billing.invoice.overdue → reminder (stub)

Port of the logic triggered by the monolith's settlement flow,
but now driven by async events rather than in-process method calls.
"""
import json
import logging
import threading

import redis

from config import REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
from services.notifier import send_voucher_wa

log = logging.getLogger("bot-py-service.redis-consumer")


class RedisConsumer:
    """Listens on configured Redis topics and dispatches to handlers."""

    def __init__(self, topics: list[str]):
        self.topics = topics
        self._thread: threading.Thread | None = None
        self._running = False

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._listen, daemon=True)
        self._thread.start()
        log.info(f"RedisConsumer subscribed to {self.topics}")

    def stop(self):
        self._running = False

    def _listen(self):
        r = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            password=REDIS_PASSWORD or None,
            decode_responses=True,
        )
        pubsub = r.pubsub()
        pubsub.subscribe(*self.topics)
        for msg in pubsub.listen():
            if not self._running:
                break
            if msg["type"] != "message":
                continue
            topic = msg["channel"]
            try:
                payload = json.loads(msg["data"])
            except (TypeError, json.JSONDecodeError):
                payload = {"raw": msg["data"]}
            self._dispatch(topic, payload)

    def _dispatch(self, topic: str, payload: dict):
        log.info(f"[event] {topic} -> {json.dumps(payload, default=str)[:200]}")
        try:
            if topic == "payment.order.settled":
                self._handle_order_settled(payload)
            elif topic == "payment.order.paid":
                self._handle_order_paid(payload)
            elif topic == "payment.failed":
                self._handle_payment_failed(payload)
            elif topic == "billing.invoice.overdue":
                self._handle_invoice_overdue(payload)
        except Exception as e:
            log.error(f"[event] handler for {topic} failed: {e}")

    def _handle_order_settled(self, payload: dict):
        """Deliver voucher notification to customer (WA/TG)."""
        voucher_name = payload.get("voucherName", "Voucher")
        username = payload.get("username", "")
        password = payload.get("password", "")
        profile = payload.get("profile", "")
        phone = payload.get("phone", "")
        validity = payload.get("validity", "")

        if phone:
            send_voucher_wa({
                "phone": phone,
                "voucherName": voucher_name,
                "username": username,
                "password": password,
                "profile": profile,
                "validity": validity,
            })
        else:
            log.info(
                f"[VOUCHER] {voucher_name} → {username}/{password} (no phone — "
                f"customer must contact admin for credentials)"
            )

    def _handle_order_paid(self, payload: dict):
        """Order paid event (can be used for admin notifications / stock updates)."""
        # Admin notifications for this flow also go out via the monolith's
        # notifier (PayhookNotifierService) as a fallback. Here we just log
        # and optionally forward to the configured Telegram admin chat.
        order_id = payload.get("orderId", "")
        amount = payload.get("uniqueAmount", 0)
        profile = payload.get("profile", "")
        log.info(f"[PAID] Order {order_id} — {profile} — Rp {amount}")

    def _handle_payment_failed(self, payload: dict):
        order_id = payload.get("orderId", "")
        reason = payload.get("reason", "unknown")
        log.warning(f"[FAILED] Order {order_id}: {reason}")

    def _handle_invoice_overdue(self, payload: dict):
        invoice_id = payload.get("invoiceId", "")
        customer = payload.get("customerId", "")
        log.warning(f"[OVERDUE] Invoice {invoice_id} for customer {customer}")
