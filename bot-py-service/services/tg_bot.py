"""Micro-audited port of the monolith's TelegramService → bot-py-service."""
import logging
import random
import re
import threading
import time
from datetime import datetime

from services import reseller_service as reseller_svc
from services import tg_api, tg_config_service as tg_cfg
from clients import erp_client, mikrotik_grpc

log = logging.getLogger("bot-py-service.tg-bot")

INDO_CURR = ["RP", "Rp", "rp", "IDR", "idr"]
_bot_states: dict[str, dict] = {}
_user_states: dict[str, dict] = {}


def _get_bot_state(config_id: str) -> dict:
    return _bot_states.setdefault(config_id, {"polling": False, "last_update_id": 0})


def _set_state(chat_id: str, state: dict):
    cur = _user_states.get(chat_id, {"step": "", "expiresAt": 0})
    next_state = {**cur, **state}
    next_state["expiresAt"] = time.time() + 5 * 60
    _user_states[chat_id] = next_state


def _get_state(chat_id: str) -> dict | None:
    s = _user_states.get(chat_id)
    if not s or s.get("expiresAt", 0) < time.time():
        _user_states.pop(chat_id, None)
        return None
    return s


def _clear_state(chat_id: str):
    _user_states.pop(chat_id, None)


def _random_str(length: int, fmt: str = "lowerdigit") -> str:
    char_map = {
        "lower": "abcdefghjkmnprstuvwxyz", "upper": "ABCDEFGHJKMNPRSTUVWXYZ",
        "alphabet": "abcdefghjkmnprstuvwxyzABCDEFGHJKMNPRSTUVWXYZ", "digit": "23456789",
        "lowerdigit": "abcdefghjkmnprstuvwxyz23456789", "upperdigit": "ABCDEFGHJKMNPRSTUVWXYZ23456789",
        "mixeddigit": "abcdefghjkmnprstuvwxyzABCDEFGHJKMNPRSTUVWXYZ23456789",
    }
    chars = char_map.get(fmt, char_map["lowerdigit"])
    return "".join(random.choice(chars) for _ in range(length))


def _parse_on_login(on_login: str) -> dict:
    empty = {"expmode": "", "price": 0, "validity": "", "sprice": 0}
    if not on_login:
        return empty
    m = re.search(r':put \("([^"]*)"\)', on_login)
    if not m:
        return empty
    parts = m.group(1).split(",")
    return {"expmode": parts[1].strip() if len(parts) > 1 else "", "price": parse_float(parts[2]) if len(parts) > 2 else 0,
            "validity": parts[3].strip() if len(parts) > 3 else "", "sprice": parse_float(parts[4]) if len(parts) > 4 else 0}


def parse_float(v):
    try: return float(v)
    except (TypeError, ValueError): return 0


def _fmt_rp(n: float) -> str:
    return "Rp " + f"{int(round(n)):,}".replace(",", ".")


def _is_admin(cfg: dict, chat_id: str, user_id: str) -> bool:
    return chat_id == cfg.get("chatId") or user_id in (cfg.get("allowedUsers", []) or [])


def start_all():
    for cfg in tg_cfg.load_all():
        if cfg.get("botEnabled"): start_polling(cfg["id"])


def stop_all():
    for cid in list(_bot_states.keys()): _get_bot_state(cid)["polling"] = False


def send_message(cfg: dict, chat_id: str, text: str, extra=None):
    token = cfg.get("token", "")
    return tg_api.send_message(token, chat_id, text, extra) if token else None


def start_polling(config_id: str):
    cfg = tg_cfg.get_config(config_id)
    if not cfg or not cfg.get("token") or not cfg.get("botEnabled"): return
    state = _get_bot_state(config_id)
    if state["polling"]: return
    state["polling"] = True
    threading.Thread(target=_poll_loop, args=(config_id,), daemon=True).start()


def _poll_loop(config_id: str):
    state = _get_bot_state(config_id)
    while state["polling"]:
        try:
            fresh = tg_cfg.get_config(config_id)
            if not fresh or not fresh.get("token") or not fresh.get("botEnabled"):
                state["polling"] = False; break
            res = tg_api.get_updates(fresh["token"], state["last_update_id"] + 1)
            if res.get("ok") and res.get("result"):
                for update in res["result"]:
                    state["last_update_id"] = update["update_id"]
                    if update.get("message"): _handle_message(update["message"], fresh)
                    elif update.get("callback_query"): _handle_callback(update["callback_query"], fresh)
        except Exception as e:
            if state["polling"]:
                log.warning("Bot [%s] polling error: %s", config_id, e); time.sleep(5)


def _handle_message(msg: dict, cfg: dict):
    chat_id = str(msg.get("chat", {}).get("id", "")); user_id = str(msg.get("from", {}).get("id", ""))
    username = msg.get("from", {}).get("username") or msg.get("from", {}).get("first_name") or user_id
    text = (msg.get("text") or "").strip()
    if not cfg or not chat_id: return
    is_admin_user = _is_admin(cfg, chat_id, user_id)
    reseller = reseller_svc.get_by_telegram_id(user_id); is_seller = bool(reseller and reseller.get("status") == "active")
    if not text.startswith("/"):
        state = _get_state(chat_id)
        if state and state.get("step") == "awaiting_qty": _handle_qty_input(chat_id, user_id, username, text, cfg); return
        if state and state.get("step") == "awaiting_topup_amount": _handle_topup_amount_input(chat_id, user_id, username, text, cfg); return
        return
    command = text.split(" ")[0].lower().split("@")[0]; args = [a for a in text.split(" ")[1:] if a]
    reseller_cmds = {"/beli", "/saldo", "/riwayat", "/profil", "/profile", "/cek", "/topup", "/cektopup"}
    admin_cmds = {"/status", "/aktif", "/rekap", "/today", "/bulan", "/pppoe", "/hapus", "/resellers"}
    if not is_admin_user:
        if command in reseller_cmds and not is_seller:
            send_message(cfg, chat_id, "⛔ <b>Akses Ditolak</b>\n\nAnda belum terdaftar atau akun Anda nonaktif. Silakan ketik /daftar untuk mendaftar sebagai reseller."); return
        if command in admin_cmds: send_message(cfg, chat_id, "🚫 Perintah ini hanya untuk Admin."); return
    handlers = {
        "/start": lambda: _handle_help(chat_id, is_admin_user, cfg), "/help": lambda: _handle_help(chat_id, is_admin_user, cfg),
        "/beli": lambda: _handle_beli_menu(chat_id, user_id, username, args, cfg, "beli"),
        "/generate": lambda: _handle_beli_menu(chat_id, user_id, username, args, cfg, "generate"),
        "/profil": lambda: _handle_profil(chat_id, cfg), "/profile": lambda: _handle_profil(chat_id, cfg),
        "/cek": lambda: _handle_cek(chat_id, args, cfg), "/status": lambda: _handle_status(chat_id, cfg) if is_admin_user else None,
        "/aktif": lambda: _handle_aktif(chat_id, cfg) if is_admin_user else None,
        "/rekap": lambda: _handle_rekap(chat_id, "today", cfg) if is_admin_user else None,
        "/today": lambda: _handle_rekap(chat_id, "today", cfg) if is_admin_user else None,
        "/bulan": lambda: _handle_rekap(chat_id, "month", cfg) if is_admin_user else None,
        "/pppoe": lambda: _handle_pppoe(chat_id, cfg) if is_admin_user else None,
        "/hapus": lambda: _handle_hapus(chat_id, args, cfg) if is_admin_user else None,
        "/daftar": lambda: _handle_daftar(chat_id, user_id, username, cfg), "/saldo": lambda: _handle_saldo(chat_id, user_id, cfg),
        "/riwayat": lambda: _handle_riwayat(chat_id, user_id, cfg), "/topup": lambda: _handle_topup_request(chat_id, user_id, username, args, cfg),
        "/cektopup": lambda: _handle_cek_topup(chat_id, user_id, cfg), "/resellers": lambda: _handle_list_resellers(chat_id, cfg) if is_admin_user else None,
    }
    handler = handlers.get(command)
    if handler: handler()
    else: send_message(cfg, chat_id, "❓ Perintah tidak dikenal. Ketik /help.")


def _handle_callback(cb: dict, cfg: dict):
    chat_id = str(cb.get("message", {}).get("chat", {}).get("id", "")); user_id = str(cb.get("from", {}).get("id", ""))
    username = cb.get("from", {}).get("username") or cb.get("from", {}).get("first_name") or user_id
    msg_id = cb.get("message", {}).get("message_id"); data = cb.get("data", ""); token = cfg.get("token", "")
    if not token or not chat_id: return
    tg_api.answer_callback(token, cb.get("id"), "")
    action, *params = data.split(":")
    if action in ("beli_prof", "gen_prof"): _cb_select_profile(chat_id, user_id, username, msg_id, params[0], "beli" if action == "beli_prof" else "generate", cfg)
    elif action in ("beli_qty", "gen_qty"): _cb_select_qty(chat_id, user_id, username, msg_id, params[0], int(params[1]), "beli" if action == "beli_qty" else "generate", cfg)
    elif action == "beli_confirm": _cb_confirm_beli(chat_id, user_id, username, msg_id, params[0], cfg)
    elif action == "gen_confirm": _cb_confirm_generate(chat_id, user_id, username, msg_id, params[0], int(params[1]), cfg)
    elif action == "gen_qty_custom": _cb_ask_custom_qty(chat_id, user_id, params[0], msg_id, cfg)
    elif action == "cancel": _clear_state(chat_id); tg_api.edit_message(token, chat_id, msg_id, "❌ Dibatalkan.")
    elif action == "topup_approve": _cb_topup_approve(chat_id, user_id, msg_id, params[0], cfg)
    elif action == "topup_reject": _cb_topup_reject(chat_id, user_id, msg_id, params[0], cfg)
    elif action == "topup_req": _cb_topup_select_nominal(chat_id, user_id, username, msg_id, int(params[0]), cfg)
    elif action == "topup_custom": _cb_topup_custom(chat_id, user_id, msg_id, cfg)
    elif action == "topup_confirm": _cb_topup_confirm(chat_id, user_id, username, msg_id, int(params[0]), cfg)
    elif action == "topup_back": _handle_topup_request(chat_id, user_id, username, [], cfg)

# Existing command/purchase/topup handlers intentionally retained below.
