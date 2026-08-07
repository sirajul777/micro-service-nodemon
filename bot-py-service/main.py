"""MikHMon — Telegram/WA Bot service (bot-py-service) — Phase 5.

Wires together:
  - DB-backed reseller / topup / telegram-config stores (db_bot, Postgres).
  - Redis consumer for `payment.order.paid`, `payment.order.settled`,
    `payment.failed`, `billing.invoice.overdue` → delivers voucher credentials
    to customers via the WhatsApp gateway (and logs/admin alerts).
  - Telegram bots (long-polling) for reseller/admin commands, ported from the
    monolith's TelegramService + reseller-bot.
  - A tiny HTTP server exposing /healthz (and optionally /resellers back-channel).

Run locally:   python main.py
Health:        curl http://localhost:8082/healthz
"""
import json
import logging
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import datetime

import db
from services import redis_consumer, tg_bot, tg_config_service as tg_cfg

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("bot-py-service")

HEALTH_PORT = int(os.getenv("HEALTH_PORT", "8082"))


def bootstrap():
    """Init DB schema + seed a default telegram config if none exists."""
    db.init_db()
    if not tg_cfg.load_all():
        log.info("No telegram config found — creating an empty default config to be filled via admin UI/env.")
        tg_cfg.save_config({
            "id": "default",
            "token": os.getenv("TELEGRAM_TOKEN", ""),
            "chatId": os.getenv("TELEGRAM_CHAT_ID", ""),
            "sessionId": os.getenv("TELEGRAM_SESSION_ID", ""),
            "notifSale": True,
            "notifDaily": False,
            "dailyTime": "23:59",
            "botEnabled": os.getenv("BOT_ENABLED", "false").lower() == "true",
            "allowedUsers": json.loads(os.getenv("TELEGRAM_ALLOWED_USERS", "[]")),
            "defaultProfile": "",
            "welcomeMsg": "",
        })


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/healthz":
            body = json.dumps({
                "status": "ok",
                "service": "bot-py-service",
                "phase": 5,
                "db": os.getenv("DB_NAME", "db_bot"),
                "redis": f"{os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', '6379')}",
                "time": datetime.now().astimezone().isoformat(),
            }).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/resellers":
            from services import reseller_service
            body = json.dumps(reseller_service.load_all(), default=str).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args):
        pass  # silence default request logging


def main():
    bootstrap()

    # Start the Redis event consumer.
    consumer = redis_consumer.RedisConsumer(redis_consumer_topics())
    consumer.start()

    # Start Telegram bots (polling) for each enabled config.
    tg_bot.start_all()

    log.info("bot-py-service started. Health endpoint on :%d/healthz", HEALTH_PORT)
    server = HTTPServer(("0.0.0.0", HEALTH_PORT), HealthHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down...")
        consumer.stop()
        tg_bot.stop_all()


def redis_consumer_topics():
    from config import CONSUMED_TOPICS
    return CONSUMED_TOPICS


if __name__ == "__main__":
    main()

