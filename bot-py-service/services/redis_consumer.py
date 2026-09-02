"""Redis event consumer for bot-py-service.

Consumes:
  payment.order.settled  → deliver voucher via WA/TG (and notify admin)
  payment.order.paid     → Telegram sale/admin notification
  payment.failed         → Telegram admin alert
  billing.invoice.overdue → Telegram billing alert

Port of the logic triggered by the monolith's settlement flow,
but now driven by async events rather than in-process method calls.
"""
import json
import logging
import threading
import os
import time

import redis

from config import (
    REDIS_HOST,
    REDIS_PORT,
    REDIS_PASSWORD,
    WA_DEFAULT_PROVIDER,
    WA_DEFAULT_TOKEN,
    WA_DEFAULT_DOMAIN,
)
from services.notifier import send_voucher_wa
from services import tg_notifier

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

        use_streams = os.getenv("USE_REDIS_STREAMS", "true").lower() == "true"
        if use_streams:
            # Use consumer groups on Redis Streams for reliable delivery.
            group = os.getenv("REDIS_STREAM_GROUP", "bot-group")
            consumer = f"bot-{os.getpid()}"
            # Ensure groups exist for each stream.
            for stream in self.topics:
                try:
                    r.xgroup_create(stream, group, id="$", mkstream=True)
                except redis.exceptions.ResponseError:
                    # Group already exists
                    pass

            last_recovery = 0.0
            recovery_interval = 30  # seconds
            stale_after_ms = 60_000  # min idle time before we reclaim a PEL entry

            while self._running:
                try:
                    now = time.time()
                    if now - last_recovery >= recovery_interval:
                        for s in self.topics:
                            self._claim_stale_pending(r, s, group, consumer, stale_after_ms)
                        last_recovery = now

                    # Read new messages from all streams (use '>' to get new entries)
                    resp = r.xreadgroup(groupname=group, consumername=consumer, streams={s: '>' for s in self.topics}, count=10, block=5000)
                    if not resp:
                        continue
                    for stream, entries in resp:
                        stream_name = stream.decode() if isinstance(stream, bytes) else stream
                        for entry_id, fields in entries:
                            raw = fields.get('data') or fields.get(b'data') or ''
                            try:
                                payload = json.loads(raw)
                            except (TypeError, json.JSONDecodeError):
                                payload = {"raw": raw}
                            if self._dispatch(stream_name, payload):
                                try:
                                    r.xack(stream, group, entry_id)
                                except Exception as e:
                                    log.error(f"[redis] xack failed for {stream_name} {entry_id}: {e}")
                            else:
                                log.warning(f"[redis] handler failed for {stream_name} {entry_id}; left pending for retry")
                except Exception as e:
                    log.error(f"[redis] stream consume error: {e}")
                    time.sleep(1)
            return

        # Fallback: legacy Pub/Sub
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

    def _dispatch(self, topic: str, payload: dict) -> bool:
        """Run the handler for `topic`. Returns True iff the event was fully
        handled and is safe to XACK. False means the message stays pending.
        """
        log.info(f"[event] {topic} -> {json.dumps(payload, default=str)[:200]}")
        try:
            if topic == "payment.order.settled":
                return self._handle_order_settled(payload)
            elif topic == "payment.order.paid":
                return self._handle_order_paid(payload)
            elif topic == "payment.failed":
                return self._handle_payment_failed(payload)
            elif topic == "billing.invoice.overdue":
                return self._handle_invoice_overdue(payload)
            return True
        except Exception as e:
            log.error(f"[event] handler for {topic} failed: {e}")
            return False

    def _handle_order_settled(self, payload: dict) -> bool:
        """Deliver voucher notification to customer (WA/TG)."""
        voucher_name = payload.get("voucherName", "Voucher")
        username = payload.get("username", "")
        password = payload.get("password", "")
        profile = payload.get("profile", "")
        phone = payload.get("phone", "")
        validity = payload.get("validity", "")

        if not phone:
            log.info(
                f"[VOUCHER] {voucher_name} → {username}/{password} (no phone — "
                f"customer must contact admin for credentials)"
            )
        else:
            if not send_voucher_wa(
                {
                    "phone": phone,
                    "voucherName": voucher_name,
                    "username": username,
                    "password": password,
                    "profile": profile,
                    "validity": validity,
                },
                wa_provider=WA_DEFAULT_PROVIDER,
                wa_token=WA_DEFAULT_TOKEN,
                wa_domain=WA_DEFAULT_DOMAIN,
            ):
                return False

        # Telegram sale notification follows the configured notifSale switch.
        # A configured bot that fails to deliver does not fail the voucher
        # settlement event because Telegram is auxiliary to the core delivery.
        try:
            tg_notifier.notify_sale(payload)
        except Exception as exc:
            log.warning(f"[TG] sale notification failed: {exc}")
        return True

    def _handle_order_paid(self, payload: dict) -> bool:
        """Notify enabled Telegram admin bots when an order is paid."""
        try:
            tg_notifier.notify_sale(payload)
        except Exception as exc:
            log.warning(f"[TG] paid notification failed: {exc}")
        order_id = payload.get("orderId", "")
        amount = payload.get("uniqueAmount", 0)
        profile = payload.get("profile", "")
        log.info(f"[PAID] Order {order_id} — {profile} — Rp {amount}")
        return True

    def _handle_payment_failed(self, payload: dict) -> bool:
        try:
            tg_notifier.notify_payment_failed(payload)
        except Exception as exc:
            log.warning(f"[TG] failure notification failed: {exc}")
        order_id = payload.get("orderId", "")
        reason = payload.get("reason", "unknown")
        log.warning(f"[FAILED] Order {order_id}: {reason}")
        return True

    def _handle_invoice_overdue(self, payload: dict) -> bool:
        try:
            tg_notifier.notify_invoice_overdue(payload)
        except Exception as exc:
            log.warning(f"[TG] overdue notification failed: {exc}")
        invoice_id = payload.get("invoiceId", "")
        customer = payload.get("customerId", "")
        log.warning(f"[OVERDUE] Invoice {invoice_id} for customer {customer}")
        return True

    def _claim_stale_pending(self, r, stream: str, group: str, consumer: str, min_idle_ms: int):
        start = "-"
        while True:
            try:
                pending = r.xpending_range(stream, group, min=start, max="+", count=50)
            except Exception as e:
                log.error(f"[redis] xpending failed for {stream}: {e}")
                return
            if not pending:
                return
            stale_ids = [p["message_id"] for p in pending if p["time_since_delivered"] >= min_idle_ms]
            if stale_ids:
                try:
                    claimed = r.xclaim(stream, group, consumer, min_idle_time=min_idle_ms, message_ids=stale_ids)
                except Exception as e:
                    log.error(f"[redis] xclaim failed for {stream}: {e}")
                    claimed = []
                for entry_id, fields in claimed:
                    raw = fields.get('data') or fields.get(b'data') or ''
                    try:
                        payload = json.loads(raw)
                    except (TypeError, json.JSONDecodeError):
                        payload = {"raw": raw}
                    if self._dispatch(stream, payload):
                        try:
                            r.xack(stream, group, entry_id)
                        except Exception as e:
                            log.error(f"[redis] xack (reclaim) failed for {stream} {entry_id}: {e}")
                    else:
                        log.warning(f"[redis] reclaimed handler failed for {stream} {entry_id}; still pending")
            if len(pending) < 50:
                return
            start = "(" + pending[-1]["message_id"]
