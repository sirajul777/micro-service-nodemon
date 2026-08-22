"""MikHMon — bot-py-service configuration (env-driven)."""
import os

# ── Redis broker ───────────────────────────────────────────────
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")

# ── Postgres (db_bot) ──────────────────────────────────────────
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_USER = os.getenv("DB_USER", "admin_mikrotik")
DB_PASSWORD = os.getenv("DB_PASSWORD", "super_postgres_password_123")
DB_NAME = os.getenv("DB_NAME", "db_bot")
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}",
)

# ── Health / HTTP ──────────────────────────────────────────────
HEALTH_PORT = int(os.getenv("HEALTH_PORT", "8082"))

# ── Cross-service gRPC endpoints ────────────────────────────────
AUTH_GRPC_ADDR = os.getenv("AUTH_GRPC_ADDR", "auth-node-service:50052")
ERP_GRPC_ADDR = os.getenv("ERP_GRPC_ADDR", "erp-node-service:50053")
MIKROTIK_GRPC_ADDR = os.getenv("MIKROTIK_GRPC_ADDR", "localhost:50051")

# ── Telegram / WhatsApp ────────────────────────────────────────
# WA gateway (Fonnte default). Token/domain are per-bot config in db_bot,
# but these provide a fallback for voucher delivery when no bot config exists.
WA_DEFAULT_PROVIDER = os.getenv("WA_DEFAULT_PROVIDER", "fonnte")
WA_DEFAULT_TOKEN = os.getenv("WA_DEFAULT_TOKEN", "")
WA_DEFAULT_DOMAIN = os.getenv("WA_DEFAULT_DOMAIN", "")

# Which payment topics this service consumes.
CONSUMED_TOPICS = [
    "payment.order.paid",
    "payment.order.settled",
    "payment.failed",
    "billing.invoice.overdue",
]
