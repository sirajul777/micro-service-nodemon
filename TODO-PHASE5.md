# ✅ bot-py-service (Phase 5) — Bot / Telegram / WA — Complete

Ported the monolith's Telegram + reseller-bot notification behavior into a
standalone Python service (`bot-py-service/`), event-driven off the
payment-service's Redis `payment.order.settled` channel.

## Steps Completed

- [x] 1. `config.py` — env-driven configuration (Redis, Postgres/db_bot, health port, cross-service endpoints, WA defaults, consumed topics).
- [x] 2. `models.py` — SQLAlchemy models for `db_bot`: `BotReseller`, `TopupLog`, `TelegramConfig`.
- [x] 3. `db.py` — SQLAlchemy engine/session bootstrap + `init_db()` schema creation.
- [x] 4. `services/reseller_service.py` — reseller CRUD + saldo topup/deduct + topup logs (port of monolith `BotResellerService`).
- [x] 5. `services/tg_config_service.py` — DB-backed telegram configs + in-memory topup-request store (mirrors monolith JSON files).
- [x] 6. `services/tg_api.py` — thin Telegram Bot API client (sendMessage, editMessage, answerCallback, getUpdates).
- [x] 7. `services/notifier.py` — WhatsApp voucher delivery (Fonnte/Wablas) with `wa.me` fallback (port of `PayhookNotifierService`).
- [x] 8. `services/redis_consumer.py` — consumes `payment.order.paid`, `payment.order.settled`, `payment.failed`, `billing.invoice.overdue`; delivers voucher credentials on settle.
- [x] 9. `services/tg_bot.py` — Telegram long-polling bot: reseller (`/beli`, `/saldo`, `/topup`, `/daftar`, `/riwayat`, `/profil`, `/cek`) + admin (`/status`, `/aktif`, `/hapus`, `/generate`, `/rekap`) commands, callback-driven inline flows, topup approve/reject.
- [x] 10. `clients/erp_client.py` — HTTP client → erp-service for active voucher types.
- [x] 11. `clients/mikrotik_grpc.py` — gRPC client → mikrotik-go-service (degraded gracefully until stubs are generated from `proto/router.proto`).
- [x] 12. `main.py` — bootstrap (DB init, default config seed), Redis consumer thread, Telegram bot polling, HTTP health endpoint.
- [x] 13. `requirements.txt` — redis, psycopg2-binary, SQLAlchemy, requests, grpcio(+tools).
- [x] 14. `Dockerfile` — python:3.11-slim, build deps for psycopg2, copies source, runs `main.py`.
- [x] 15. `services/__init__.py`, `clients/__init__.py` — package markers.
- [x] 16. **Verification** — `python3 -m py_compile` on all modules → EXIT_CODE=0 (all compile cleanly).

## Cross-service contract (what bot consumes)
| Topic | Payload key fields | Bot action |
|-------|--------------------|------------|
| `payment.order.paid` | `{ orderId, uniqueAmount, voucherName, profile }` | admin log |
| `payment.order.settled` | `{ orderId, username, password, phone, profile, validity }` | WA voucher delivery + admin log |
| `payment.failed` | `{ orderId, reason }` | admin alert (log) |
| `billing.invoice.overdue` | `{ invoiceId, customerId }` | reminder (log) |

## Notes
- Router operations (AddHotspotUser, list users, status) are delegated to
  `mikrotik-go-service` via gRPC. The client degrades gracefully (returns
  `success: false` with a "not wired" message) until generated stubs from
  `proto/router.proto` are dropped into `clients/mikrotik_grpc.py`.
- Voucher types are read from `erp-node-service` (`GET /voucher/types/active`).
- Telegram token/chatId are seeded from `TELEGRAM_TOKEN` / `TELEGRAM_CHAT_ID`
  env when no config exists, and stored in `db_bot.telegram_configs`.
