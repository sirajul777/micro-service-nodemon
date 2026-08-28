# ✅ bot-py-service (Phase 5) — Bot / Telegram / WA — Complete

Ported the monolith's Telegram + reseller-bot notification behavior into a
standalone Python service (`bot-py-service/`), event-driven off the
payment-service's Redis `payment.order.settled` channel.

## Steps Completed

- [x] 1. `config.py` — env-driven configuration (Redis, Postgres/db_bot, health port, ERP/MikroTik gRPC endpoints, WA defaults, consumed topics).
- [x] 2. `models.py` — SQLAlchemy models for `db_bot`: `BotReseller`, `TopupLog`, `TelegramConfig`.
- [x] 3. `db.py` — SQLAlchemy engine/session bootstrap + `init_db()` schema creation.
- [x] 4. `services/reseller_service.py` — reseller CRUD + saldo topup/deduct + topup logs (port of monolith `BotResellerService`).
- [x] 5. `services/tg_config_service.py` — DB-backed telegram configs + in-memory topup-request store (mirrors monolith JSON files).
- [x] 6. `services/tg_api.py` — thin Telegram Bot API client (sendMessage, editMessage, answerCallback, getUpdates).
- [x] 7. `services/notifier.py` — WhatsApp voucher delivery (Fonnte/Wablas) with `wa.me` fallback (port of `PayhookNotifierService`).
- [x] 8. `services/redis_consumer.py` — consumes `payment.order.paid`, `payment.order.settled`, `payment.failed`, `billing.invoice.overdue`; delivers voucher credentials on settle.
- [x] 9. `services/tg_bot.py` — Telegram long-polling bot: reseller (`/beli`, `/saldo`, `/topup`, `/daftar`, `/riwayat`, `/profil`, `/cek`) + admin (`/status`, `/aktif`, `/hapus`, `/generate`, `/rekap`) commands, callback-driven inline flows, topup approve/reject.
- [x] 10. `clients/erp_client.py` — compatibility facade retained, now backed by the internal ERP gRPC client.
- [x] 11. `clients/erp_grpc.py` — gRPC client for `GetActiveVoucherTypes` and `GetVoucherType`.
- [x] 12. `clients/mikrotik_grpc.py` — gRPC client → mikrotik-go-service.
- [x] 13. `main.py` — bootstrap (DB init, default config seed), Redis consumer thread, Telegram bot polling, HTTP health endpoint.
- [x] 14. `requirements.txt` — redis, psycopg2-binary, SQLAlchemy, requests, grpcio(+tools).
- [x] 15. `Dockerfile` — generates bot + ERP internal gRPC Python stubs during image build.
- [x] 16. `docker-compose.yml` — `ERP_GRPC_ADDR=erp-node-service:50053` and dependency wiring.
- [x] 17. `services/__init__.py`, `clients/__init__.py` — package markers.
- [x] 18. **Verification** — Python syntax/import compilation should be run in the container build.

## Cross-service contract (what bot consumes)
| Topic | Payload key fields | Bot action |
|-------|--------------------|------------|
| `payment.order.paid` | `{ orderId, uniqueAmount, voucherName, profile }` | admin log |
| `payment.order.settled` | `{ orderId, username, password, phone, profile, validity }` | WA voucher delivery + admin log |
| `payment.failed` | `{ orderId, reason }` | admin alert (log) |
| `billing.invoice.overdue` | `{ invoiceId, customerId }` | reminder (log) |

## Internal service communication
- ERP voucher-type reads now use **gRPC only** (`ErpInternalService.GetActiveVoucherTypes` / `GetVoucherType`).
- Router operations use gRPC (`mikrotik-go-service`).
- Redis remains the asynchronous event transport for payment/billing events.
- HTTP remains exposed only for the bot health endpoint and external Telegram/WhatsApp APIs.
