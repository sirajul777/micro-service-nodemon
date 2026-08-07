-- ─────────────────────────────────────────────────────────────────────────────
-- MikHMon — PostgreSQL database-per-service initialization
--
-- Runs once on first container start (docker-entrypoint-initdb.d).
-- Creates ONE database per service to enforce the database-per-service
-- isolation pattern while sharing a single Postgres container locally.
--
-- Databases:
--   db_auth     → auth-node-service   (users, app_config, mobile_tokens)
--   db_erp      → erp-node-service    (voucher_types, voucher_batches, profile_meta)
--   db_payment  → payment-service     (payment_config, voucher_orders, billing, invoices, ...)
--   db_router   → mikrotik-go-service (router_sessions)
--   db_bot      → bot-py-service      (bot_resellers, topup_logs, telegram_configs)
-- ─────────────────────────────────────────────────────────────────────────────

-- Each service connects as the same role (POSTGRES_USER) but to its own DB,
-- so other services cannot see its tables. For stricter isolation in
-- production, create dedicated roles per service and grant only on its DB.
CREATE DATABASE db_auth;
CREATE DATABASE db_erp;
CREATE DATABASE db_payment;
CREATE DATABASE db_router;
CREATE DATABASE db_bot;
