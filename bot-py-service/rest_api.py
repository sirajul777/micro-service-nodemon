"""bot-py-service REST API — exposes resellers, bot-resellers, telegram config.

Internal authentication is performed through AuthService gRPC. HTTP remains
for external admin/BFF endpoints and health only.
"""
import json
import logging
import re
from datetime import datetime

from clients import auth_grpc
from services import reseller_service, tg_config_service, tg_bot

log = logging.getLogger("bot-py-service.rest")


def _validate_token(authorization: str | None) -> bool:
    if not authorization or not authorization.lower().startswith("bearer "):
        return False
    token = authorization[7:].strip()
    if not token:
        return False
    return auth_grpc.validate_token(token)


def _json(self, code: int, data):
    body = json.dumps(data, default=str).encode()
    self.send_response(code)
    self.send_header("Content-Type", "application/json")
    self.send_header("Content-Length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)


def _read_body(self, max_bytes=2_000_000):
    length = int(self.headers.get("Content-Length") or 0)
    if length <= 0 or length > max_bytes:
        return {}
    raw = self.rfile.read(length)
    try:
        return json.loads(raw.decode("utf-8") or "{}")
    except (ValueError, UnicodeDecodeError) as e:
        log.warning(f"[rest] bad JSON body: {e}")
        return {}


def _require_auth(self) -> bool:
    if _validate_token(self.headers.get("Authorization")):
        return True
    _json(self, 401, {"success": False, "message": "Unauthorized"})
    return False


def _split_path(path: str) -> list[str]:
    return [p for p in path.split("?", 1)[0].split("/") if p]


def route(self):
    method = self.command.upper()
    parts = _split_path(self.path)
    if not parts:
        return False
    root = parts[0]
    if root in ("resellers", "bot-resellers"):
        return _route_resellers(self, method, parts)
    if root == "telegram":
        return _route_telegram(self, method, parts)
    return False


def _route_resellers(self, method: str, parts: list[str]):
    if not _require_auth(self):
        return True
    is_bot = parts[0] == "bot-resellers"

    if not is_bot:
        if method == "GET" and len(parts) == 3 and parts[1] == "session":
            return _json(self, 200, reseller_service.load_by_router(parts[2]))
        if method == "GET" and len(parts) == 1:
            return _json(self, 200, reseller_service.load_all_plain())
        if method == "GET" and len(parts) == 2:
            r = reseller_service.get_plain_by_id(parts[1])
            if not r:
                return _json(self, 404, {"success": False, "message": "Not found"})
            return _json(self, 200, r)
        if method == "POST" and len(parts) == 1:
            r = reseller_service.upsert_plain(_read_body(self))
            return _json(self, 200, {"success": True, "reseller": r})
        if method == "PUT" and len(parts) == 2:
            body = _read_body(self)
            body["id"] = parts[1]
            r = reseller_service.upsert_plain(body)
            return _json(self, 200, {"success": True, "reseller": r})
        if method == "DELETE" and len(parts) == 2:
            return _json(self, 200, {"success": reseller_service.delete_plain(parts[1])})
        return _json(self, 404, {"success": False, "message": f"Unknown route: {self.path}"})

    if method == "GET" and len(parts) >= 2 and parts[1] == "logs":
        q = self.path.split("?", 1)[1] if "?" in self.path else ""
        params = dict(re.findall(r"([^&=]+)=([^&]*)", q))
        rid = params.get("resellerId")
        limit = int(params.get("limit", "100") or "100")
        return _json(self, 200, reseller_service.load_logs(rid, limit))
    if method == "GET" and len(parts) == 1:
        return _json(self, 200, reseller_service.load_all())
    if method == "GET" and len(parts) == 2:
        r = reseller_service.get_by_id(parts[1])
        if not r:
            return _json(self, 404, {"success": False, "message": "Not found"})
        return _json(self, 200, r)
    if method == "POST" and len(parts) == 1:
        return _json(self, 200, {"success": True, "reseller": reseller_service.upsert(_read_body(self))})
    if method == "PUT" and len(parts) == 2:
        body = _read_body(self)
        body["id"] = parts[1]
        return _json(self, 200, {"success": True, "reseller": reseller_service.upsert(body)})
    if method == "DELETE" and len(parts) == 2:
        return _json(self, 200, {"success": reseller_service.delete(parts[1])})
    if method == "PATCH" and len(parts) == 3 and parts[2] == "toggle":
        r = reseller_service.get_by_id(parts[1])
        if not r:
            return _json(self, 404, {"success": False, "message": "Not found"})
        new_status = "inactive" if r.get("status") == "active" else "active"
        updated = reseller_service.upsert({"id": parts[1], "status": new_status})
        return _json(self, 200, {"success": True, "active": new_status == "active", "reseller": updated})
    if method == "POST" and len(parts) == 3 and parts[2] == "topup":
        body = _read_body(self)
        res = reseller_service.topup(parts[1], float(body.get("amount", 0) or 0), body.get("note", ""), body.get("by", "admin"))
        if not res:
            return _json(self, 404, {"success": False, "message": "Reseller tidak ditemukan"})
        return _json(self, 200, {"success": True, **res})
    return _json(self, 404, {"success": False, "message": f"Unknown route: {self.path}"})


def _route_telegram(self, method: str, parts: list[str]):
    if not _require_auth(self):
        return True
    if method == "GET" and len(parts) == 2 and parts[1] == "config":
        return _json(self, 200, tg_config_service.load_all())
    if method == "GET" and len(parts) == 3 and parts[1] == "config":
        cfg = tg_config_service.get_config(parts[2])
        if not cfg:
            return _json(self, 404, {"success": False, "message": "Not found"})
        return _json(self, 200, cfg)
    if method == "POST" and len(parts) == 2 and parts[1] == "config":
        body = _read_body(self)
        if not body.get("id"):
            body["id"] = f"cfg-{int(datetime.now().timestamp() * 1000)}"
        tg_config_service.save_config(body)
        return _json(self, 200, {"success": True, "config": tg_config_service.get_config(body["id"])})
    if method == "PUT" and len(parts) == 3 and parts[1] == "config":
        body = _read_body(self)
        body["id"] = parts[2]
        tg_config_service.save_config(body)
        if body.get("botEnabled"):
            tg_bot.start_polling(parts[2])
        return _json(self, 200, {"success": True, "config": tg_config_service.get_config(parts[2])})
    if method == "DELETE" and len(parts) == 3 and parts[1] == "config":
        tg_config_service.delete_config(parts[2])
        return _json(self, 200, {"success": True})
    if method == "POST" and len(parts) == 2 and parts[1] == "test":
        body = _read_body(self)
        cfg = tg_config_service.get_config(body.get("id") or None)
        ok = False
        message = ""
        if cfg:
            try:
                res = tg_bot.send_message(cfg, body.get("chatId") or cfg.get("chatId"), body.get("message") or "Test dari MikHMon")
                ok = bool(res)
                message = "Pesan terkirim" if ok else "Gagal mengirim pesan"
            except Exception as e:
                message = str(e)
        else:
            message = "Konfigurasi Telegram tidak ditemukan"
        return _json(self, 200, {"success": ok, "message": message})
    if method == "GET" and len(parts) == 2 and parts[1] == "logs":
        return _json(self, 200, tg_config_service.load_topup_requests())
    return _json(self, 404, {"success": False, "message": f"Unknown route: {self.path}"})
