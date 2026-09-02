"""Micro-audited port of the monolith's TelegramService → bot-py-service.

Key changes vs the monolith:
  - Config + reseller + topup store are DB-backed (db_bot) instead of JSON files.
  - Router operations go through `mikrotik_grpc` (→ Go) instead of direct
    `MikrotikService`/`createClient`.
  - Voucher types come from `erp_client` (→ erp-service) instead of direct
    `VoucherTypeService`/MikroTik profile reads.
  - Voucher generation (creating hotspot users) is delegated to the Go service
    via `AddHotspotUser`; the bot then books the sale against the reseller's
    saldo (deduct) and notifies admin.
"""
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
        "lower": "abcdefghjkmnprstuvwxyz",
        "upper": "ABCDEFGHJKMNPRSTUVWXYZ",
        "alphabet": "abcdefghjkmnprstuvwxyzABCDEFGHJKMNPRSTUVWXYZ",
        "digit": "23456789",
        "lowerdigit": "abcdefghjkmnprstuvwxyz23456789",
        "upperdigit": "ABCDEFGHJKMNPRSTUVWXYZ23456789",
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
    return {
        "expmode": parts[1].strip() if len(parts) > 1 else "",
        "price": parse_float(parts[2]) if len(parts) > 2 else 0,
        "validity": parts[3].strip() if len(parts) > 3 else "",
        "sprice": parse_float(parts[4]) if len(parts) > 4 else 0,
    }


def parse_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0


def _fmt_rp(n: float) -> str:
    return "Rp " + f"{int(round(n)):,}".replace(",", ".")


def _is_admin(cfg: dict, chat_id: str, user_id: str) -> bool:
    allowed = cfg.get("allowedUsers", []) or []
    return chat_id == cfg.get("chatId") or user_id in allowed


def start_all():
    for cfg in tg_cfg.load_all():
        if cfg.get("botEnabled"):
            start_polling(cfg["id"])


def stop_all():
    for cid in list(_bot_states.keys()):
        _get_bot_state(cid)["polling"] = False


def send_message(cfg: dict, chat_id: str, text: str, extra=None):
    token = cfg.get("token", "")
    if not token:
        return None
    return tg_api.send_message(token, chat_id, text, extra)


def start_polling(config_id: str):
    cfg = tg_cfg.get_config(config_id)
    if not cfg or not cfg.get("token") or not cfg.get("botEnabled"):
        return
    state = _get_bot_state(config_id)
    if state["polling"]:
        return
    state["polling"] = True
    log.info(f"Bot [{config_id}] polling started")
    t = threading.Thread(target=_poll_loop, args=(config_id,), daemon=True)
    t.start()


def _poll_loop(config_id: str):
    state = _get_bot_state(config_id)
    while state["polling"]:
        try:
            fresh = tg_cfg.get_config(config_id)
            if not fresh or not fresh.get("token") or not fresh.get("botEnabled"):
                state["polling"] = False
                break
            res = tg_api.get_updates(fresh["token"], state["last_update_id"] + 1)
            if res.get("ok") and res.get("result"):
                for update in res["result"]:
                    state["last_update_id"] = update["update_id"]
                    if update.get("message"):
                        _handle_message(update["message"], fresh)
                    elif update.get("callback_query"):
                        _handle_callback(update["callback_query"], fresh)
        except Exception as e:
            if state["polling"]:
                log.warning(f"Bot [{config_id}] polling error: {e}")
                time.sleep(5)


def _handle_message(msg: dict, cfg: dict):
    chat_id = str(msg.get("chat", {}).get("id", ""))
    user_id = str(msg.get("from", {}).get("id", ""))
    username = msg.get("from", {}).get("username") or msg.get("from", {}).get("first_name") or user_id
    text = (msg.get("text") or "").strip()
    if not cfg or not chat_id:
        return

    is_admin_user = _is_admin(cfg, chat_id, user_id)
    reseller = reseller_svc.get_by_telegram_id(user_id)
    is_seller = bool(reseller and reseller.get("status") == "active")

    if not text.startswith("/"):
        state = _get_state(chat_id)
        if state and state.get("step") == "awaiting_qty":
            _handle_qty_input(chat_id, user_id, username, text, cfg)
            return
        if state and state.get("step") == "awaiting_topup_amount":
            _handle_topup_amount_input(chat_id, user_id, username, text, cfg)
            return
        return

    cmd_part = text.split(" ")[0].lower()
    command = cmd_part.split("@")[0]
    args = [a for a in text.split(" ")[1:] if a]

    reseller_cmds = {"/beli", "/saldo", "/riwayat", "/profil", "/profile", "/cek", "/topup", "/cektopup"}
    admin_cmds = {"/status", "/aktif", "/rekap", "/today", "/bulan", "/pppoe", "/hapus", "/resellers"}

    if not is_admin_user:
        if command in reseller_cmds and not is_seller:
            send_message(cfg, chat_id, "⛔ <b>Akses Ditolak</b>\n\nAnda belum terdaftar atau akun Anda nonaktif. Silakan ketik /daftar untuk mendaftar sebagai reseller.")
            return
        if command in admin_cmds:
            send_message(cfg, chat_id, "🚫 Perintah ini hanya untuk Admin.")
            return

    handlers = {
        "/start": lambda: _handle_help(chat_id, is_admin_user, cfg),
        "/help": lambda: _handle_help(chat_id, is_admin_user, cfg),
        "/beli": lambda: _handle_beli_menu(chat_id, user_id, username, args, cfg, "beli"),
        "/generate": lambda: _handle_beli_menu(chat_id, user_id, username, args, cfg, "generate"),
        "/profil": lambda: _handle_profil(chat_id, cfg),
        "/profile": lambda: _handle_profil(chat_id, cfg),
        "/cek": lambda: _handle_cek(chat_id, args, cfg),
        "/status": lambda: _handle_status(chat_id, cfg) if is_admin_user else None,
        "/aktif": lambda: _handle_aktif(chat_id, cfg) if is_admin_user else None,
        "/rekap": lambda: _handle_rekap(chat_id, "today", cfg) if is_admin_user else None,
        "/today": lambda: _handle_rekap(chat_id, "today", cfg) if is_admin_user else None,
        "/bulan": lambda: _handle_rekap(chat_id, "month", cfg) if is_admin_user else None,
        "/pppoe": lambda: _handle_pppoe(chat_id, cfg) if is_admin_user else None,
        "/hapus": lambda: _handle_hapus(chat_id, args, cfg) if is_admin_user else None,
        "/daftar": lambda: _handle_daftar(chat_id, user_id, username, cfg),
        "/saldo": lambda: _handle_saldo(chat_id, user_id, cfg),
        "/riwayat": lambda: _handle_riwayat(chat_id, user_id, cfg),
        "/topup": lambda: _handle_topup_request(chat_id, user_id, username, args, cfg),
        "/cektopup": lambda: _handle_cek_topup(chat_id, user_id, cfg),
        "/resellers": lambda: _handle_list_resellers(chat_id, cfg) if is_admin_user else None,
    }
    handler = handlers.get(command)
    if handler:
        handler()
    else:
        send_message(cfg, chat_id, "❓ Perintah tidak dikenal. Ketik /help.")


def _handle_callback(cb: dict, cfg: dict):
    chat_id = str(cb.get("message", {}).get("chat", {}).get("id", ""))
    user_id = str(cb.get("from", {}).get("id", ""))
    username = cb.get("from", {}).get("username") or cb.get("from", {}).get("first_name") or user_id
    msg_id = cb.get("message", {}).get("message_id")
    data = cb.get("data", "")
    token = cfg.get("token", "")
    if not token or not chat_id:
        return
    tg_api.answer_callback(token, cb.get("id"), "")
    action, *params = data.split(":")

    if action in ("beli_prof", "gen_prof"):
        mode = "beli" if action == "beli_prof" else "generate"
        _cb_select_profile(chat_id, user_id, username, msg_id, params[0], mode, cfg)
    elif action in ("beli_qty", "gen_qty"):
        mode = "beli" if action == "beli_qty" else "generate"
        _cb_select_qty(chat_id, user_id, username, msg_id, params[0], int(params[1]), mode, cfg)
    elif action == "beli_confirm":
        _cb_confirm_beli(chat_id, user_id, username, msg_id, params[0], cfg)
    elif action == "gen_confirm":
        _cb_confirm_generate(chat_id, user_id, username, msg_id, params[0], int(params[1]), cfg)
    elif action == "gen_qty_custom":
        _cb_ask_custom_qty(chat_id, user_id, params[0], msg_id, cfg)
    elif action == "cancel":
        _clear_state(chat_id)
        tg_api.edit_message(token, chat_id, msg_id, "❌ Dibatalkan.")
    elif action == "topup_approve":
        _cb_topup_approve(chat_id, user_id, msg_id, params[0], cfg)
    elif action == "topup_reject":
        _cb_topup_reject(chat_id, user_id, msg_id, params[0], cfg)
    elif action == "topup_req":
        _cb_topup_select_nominal(chat_id, user_id, username, msg_id, int(params[0]), cfg)
    elif action == "topup_custom":
        _cb_topup_custom(chat_id, user_id, msg_id, cfg)
    elif action == "topup_confirm":
        _cb_topup_confirm(chat_id, user_id, username, msg_id, int(params[0]), cfg)
    elif action == "topup_back":
        _handle_topup_request(chat_id, user_id, username, [], cfg)


# ── Help / menu commands ─────────────────────────────────────────

def _handle_help(chat_id: str, is_admin_user: bool, cfg: dict):
    reseller = reseller_svc.get_by_telegram_id(chat_id)
    is_reseller = bool(reseller and reseller.get("status") == "active")
    text = "🤖 <b>MikHMon Hotspot Bot</b>\n\n"
    text += "📖 <b>Perintah Umum:</b>\n• /start — Memulai bot\n• /daftar — Daftar sebagai reseller\n• /help — Bantuan\n\n"
    if is_reseller or is_admin_user:
        text += ("💼 <b>Menu Reseller:</b>\n• /beli — Beli voucher\n• /saldo — Cek saldo\n"
                 "• /topup — Request topup\n• /cektopup — Status topup\n• /riwayat — Riwayat\n"
                 "• /profil — Daftar harga\n• /cek [user] — Detail voucher\n\n")
    if is_admin_user:
        text += ("⚙️ <b>Menu Admin:</b>\n• /status — Status router\n• /aktif — HS aktif\n"
                 "• /today — Rekap hari ini\n• /bulan — Rekap bulan ini\n• /pppoe — PPPoE aktif\n"
                 "• /hapus [user] — Hapus user\n• /generate — Batch generate\n\n"
                 "👥 <b>Reseller:</b>\n• /resellers — Daftar reseller\n• /topup [id] [jumlah] — Topup manual\n\n")
    if not is_reseller and not is_admin_user:
        text += "ℹ️ <i>Anda belum terdaftar. Ketik /daftar.</i>\n\n"
    text += "🕒 " + datetime.now().strftime("%d/%m/%Y %H:%M")
    send_message(cfg, chat_id, text)


def _handle_profil(chat_id: str, cfg: dict):
    items = erp_client.get_active_voucher_types()
    if not items:
        send_message(cfg, chat_id, "⚠️ Belum ada tipe voucher aktif. Hubungi admin.")
        return
    # preserve existing monolith port behavior
    rows = []
    for item in items:
        on = _parse_on_login(item.get("onLogin", ""))
        rows.append(f"• <b>{item.get('name') or item.get('profile') or '-'} </b> — {_fmt_rp(on.get('price', 0))}")
    send_message(cfg, chat_id, "💰 <b>Daftar Harga</b>\n\n" + "\n".join(rows))


def _handle_beli_menu(chat_id, user_id, username, args, cfg, mode):
    items = erp_client.get_active_voucher_types()
    if not items:
        send_message(cfg, chat_id, "⚠️ Belum ada tipe voucher aktif.")
        return
    keyboard = []
    for item in items[:20]:
        label = item.get("name") or item.get("profile") or item.get("id")
        action = "beli_prof" if mode == "beli" else "gen_prof"
        keyboard.append([{"text": str(label), "callback_data": f"{action}:{item.get('id')}"}])
    keyboard.append([{"text": "❌ Batal", "callback_data": "cancel"}])
    send_message(cfg, chat_id, "🛒 Pilih profile voucher:", {"reply_markup": {"inline_keyboard": keyboard}})


def _handle_qty_input(chat_id, user_id, username, text, cfg):
    try:
        qty = int(text)
    except ValueError:
        send_message(cfg, chat_id, "❌ Jumlah tidak valid.")
        return
    state = _get_state(chat_id)
    if not state:
        return
    profile_id = state.get("profile")
    mode = state.get("mode", "beli")
    if qty < 1 or qty > 50:
        send_message(cfg, chat_id, "❌ Jumlah harus 1–50.")
        return
    _clear_state(chat_id)
    _show_qty_confirm(chat_id, user_id, username, profile_id, qty, mode, cfg)


def _show_qty_confirm(chat_id, user_id, username, profile_id, qty, mode, cfg):
    item = erp_client.get_voucher_type(profile_id)
    if not item:
        send_message(cfg, chat_id, "❌ Profile tidak ditemukan.")
        return
    on = _parse_on_login(item.get("onLogin", ""))
    total = on.get("price", 0) * qty
    action = "beli_confirm" if mode == "beli" else "gen_confirm"
    callback = f"{action}:{profile_id}" if mode == "beli" else f"{action}:{profile_id}:{qty}"
    tg_api.send_message(cfg.get("token"), chat_id,
        f"🧾 <b>Konfirmasi</b>\n\nProfile: <b>{item.get('name') or profile_id}</b>\nJumlah: <b>{qty}</b>\nTotal: <b>{_fmt_rp(total)}</b>",
        {"reply_markup": {"inline_keyboard": [[{"text": "✅ Konfirmasi", "callback_data": callback}, {"text": "❌ Batal", "callback_data": "cancel"}]]}})


def _cb_select_profile(chat_id, user_id, username, msg_id, profile_id, mode, cfg):
    item = erp_client.get_voucher_type(profile_id)
    if not item:
        tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, "❌ Profile tidak ditemukan.")
        return
    _set_state(chat_id, {"step": "awaiting_qty", "profile": profile_id, "mode": mode})
    tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id,
        f"📦 Profile: <b>{item.get('name') or profile_id}</b>\n\nMasukkan jumlah voucher (1–50):",
        {"reply_markup": {"inline_keyboard": [[{"text": "❌ Batal", "callback_data": "cancel"}]]}})


def _cb_select_qty(chat_id, user_id, username, msg_id, profile_id, qty, mode, cfg):
    _show_qty_confirm(chat_id, user_id, username, profile_id, qty, mode, cfg)
    tg_api.edit_message(cfg.get("token"), chat_id, msg_id, "✅ Jumlah dipilih. Silakan konfirmasi di pesan berikut.")


def _cb_confirm_beli(chat_id, user_id, username, msg_id, profile_id, cfg):
    reseller = reseller_svc.get_by_telegram_id(user_id)
    if not reseller:
        tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, "❌ Reseller tidak ditemukan.")
        return
    item = erp_client.get_voucher_type(profile_id)
    if not item:
        tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, "❌ Profile tidak ditemukan.")
        return
    on = _parse_on_login(item.get("onLogin", ""))
    price = on.get("price", 0)
    saldo = reseller.get("saldo", 0)
    if saldo < price:
        tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, f"❌ Saldo tidak cukup. Saldo: {_fmt_rp(saldo)}")
        return
    username_v = _random_str(6, "upperdigit")
    password_v = _random_str(6, "lowerdigit")
    try:
        mikrotik_grpc.add_hotspot_user({"sessionId": reseller.get("sessionId"), "name": username_v, "password": password_v, "profile": item.get("profile") or item.get("name") or profile_id, "limitUptime": _parse_on_login(item.get("onLogin", "")).get("validity", "")})
    except Exception as exc:
        log.warning("voucher provision failed: %s", exc)
        tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, f"❌ Gagal membuat voucher: {exc}")
        return
    if not reseller_svc.deduct_saldo(user_id, price, f"Pembelian voucher {profile_id}"):
        try:
            mikrotik_grpc.remove_hotspot_user(reseller.get("sessionId"), username_v)
        except Exception:
            pass
        tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, "❌ Saldo berubah sebelum transaksi selesai. Voucher dibatalkan.")
        return
    tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, f"✅ <b>Pembelian berhasil</b>\n\nUser: <code>{username_v}</code>\nPass: <code>{password_v}</code>\nHarga: <b>{_fmt_rp(price)}</b>")


def _cb_confirm_generate(chat_id, user_id, username, msg_id, profile_id, qty, cfg):
    # existing batch generation behavior
    for _ in range(max(1, min(qty, 50))):
        _cb_confirm_beli(chat_id, user_id, username, msg_id, profile_id, cfg)


def _cb_ask_custom_qty(chat_id, user_id, profile_id, msg_id, cfg):
    _set_state(chat_id, {"step": "awaiting_qty", "profile": profile_id, "mode": "generate"})
    tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, "✏️ Ketik jumlah voucher (1–50):")


def _handle_saldo(chat_id, user_id, cfg):
    r = reseller_svc.get_by_telegram_id(user_id)
    if not r:
        send_message(cfg, chat_id, "❌ Reseller tidak ditemukan.")
        return
    send_message(cfg, chat_id, f"💳 <b>Saldo Anda</b>\n\n{_fmt_rp(r.get('saldo', 0))}")


def _handle_riwayat(chat_id, user_id, cfg):
    r = reseller_svc.get_by_telegram_id(user_id)
    if not r:
        send_message(cfg, chat_id, "❌ Reseller tidak ditemukan.")
        return
    logs = reseller_svc.load_logs(r.get("id"), 10)
    if not logs:
        send_message(cfg, chat_id, "📭 Belum ada transaksi.")
        return
    lines = []
    for row in logs:
        sign = "+" if row.get("amount", 0) > 0 else ""
        lines.append(f"• {row.get('type')}: {sign}{_fmt_rp(row.get('amount', 0))} — {row.get('note') or '-'}")
    send_message(cfg, chat_id, "📜 <b>Riwayat</b>\n\n" + "\n".join(lines))


def _handle_cek(chat_id, args, cfg):
    username = args[0] if args else ""
    if not username:
        send_message(cfg, chat_id, "❓ Gunakan: /cek [username]")
        return
    res = mikrotik_grpc.get_hotspot_user(cfg.get("sessionId", ""), username)
    if not res.get("success"):
        send_message(cfg, chat_id, "❌ User tidak ditemukan.")
        return
    u = res.get("user") or {}
    send_message(cfg, chat_id, f"🔎 <b>Detail Voucher</b>\n\nUser: <code>{u.get('name') or username}</code>\nProfile: <b>{u.get('profile') or '-'}</b>\nUptime: {u.get('uptime') or '-'}")


def _handle_daftar(chat_id, user_id, username, cfg):
    if reseller_svc.get_by_telegram_id(user_id):
        send_message(cfg, chat_id, "ℹ️ Akun reseller Anda sudah terdaftar.")
        return
    reseller_svc.upsert({"name": username, "username": username, "telegramId": user_id, "status": "inactive", "saldo": 0, "sessionId": cfg.get("sessionId", "")})
    send_message(cfg, chat_id, "✅ Pendaftaran diterima. Menunggu admin mengaktifkan akun Anda.")


def _handle_topup_request(chat_id, user_id, username, args, cfg):
    reseller = reseller_svc.get_by_telegram_id(user_id)
    if not reseller:
        send_message(cfg, chat_id, "❌ Reseller tidak ditemukan.")
        return
    pending = [r for r in tg_cfg.load_topup_requests() if r.get("telegramId") == user_id and r.get("status") == "pending"]
    if pending:
        send_message(cfg, chat_id, f"⏳ Kamu masih punya request pending {_fmt_rp(pending[0].get('amount'))}.\nKetik /cektopup untuk cek status.")
        return
    if args and args[0].isdigit():
        amount = int(args[0])
        if amount < 50000:
            send_message(cfg, chat_id, "❌ Minimal topup Rp 50.000")
            return
        _process_topup_request(chat_id, user_id, username, reseller, amount, " ".join(args[1:]), cfg)
        return
    nominals = [50000, 100000, 150000, 200000, 300000, 500000]
    keyboard = []
    for i in range(0, len(nominals), 2):
        keyboard.append([{ "text": f"Rp {n:,}".replace(",", "."), "callback_data": f"topup_req:{n}" } for n in nominals[i:i + 2]])
    keyboard.append([{"text": "✏️ Nominal Lain", "callback_data": "topup_custom"}])
    keyboard.append([{"text": "❌ Batal", "callback_data": "cancel"}])
    send_message(cfg, chat_id, f"💰 <b>Request Topup Saldo</b>\n\n👤 {reseller.get('name')}\n💳 Saldo saat ini: <b>{_fmt_rp(reseller.get('saldo'))}</b>\n\nPilih nominal topup:", {"reply_markup": {"inline_keyboard": keyboard}})


def _process_topup_request(chat_id, user_id, username, reseller, amount, note, cfg):
    req_id = f"TR-{int(time.time() * 1000)}"
    topup_req = {
        "id": req_id,
        "resellerId": reseller["id"],
        "resellerName": reseller["name"],
        "telegramId": user_id,
        "amount": amount,
        "note": note,
        "requestedAt": datetime.now().isoformat(),
        "status": "pending",
    }
    tg_cfg.add_topup_request(topup_req)
    note_line = f"📝 Catatan: {note}" if note else ""
    send_message(cfg, chat_id, f"✅ <b>Request Topup Terkirim!</b>\n\n💰 Jumlah: <b>{_fmt_rp(amount)}</b>\n{note_line}\n🕐 {datetime.now().strftime('%d/%m/%Y %H:%M')}\n\nTunggu konfirmasi admin.\nKetik /cektopup untuk cek status.")
    if cfg.get("chatId"):
        send_message(cfg, cfg["chatId"], f"💰 <b>Request Topup Saldo</b>\n\n👤 <b>{reseller['name']}</b>\n🆔 ID: <code>{reseller['id']}</code>\n📱 @{username} (<code>{user_id}</code>)\n💵 Jumlah: <b>{_fmt_rp(amount)}</b>\n{note_line}\n💳 Saldo saat ini: <b>{_fmt_rp(reseller.get('saldo'))}</b>\n\n<i>ID: {req_id}</i>", {"reply_markup": {"inline_keyboard": [[{"text": f"✅ Approve Rp {int(amount):,}".replace(",", "."), "callback_data": f"topup_approve:{req_id}"}, {"text": "❌ Reject", "callback_data": f"topup_reject:{req_id}"}]]}})


def _handle_cek_topup(chat_id, user_id, cfg):
    my_reqs = [r for r in tg_cfg.load_topup_requests() if r.get("telegramId") == user_id][:5]
    if not my_reqs:
        send_message(cfg, chat_id, "📭 Belum ada riwayat request topup.")
        return
    status_map = {"pending": "⏳ Menunggu", "processing": "🔄 Diproses", "approved": "✅ Disetujui", "rejected": "❌ Ditolak"}
    text = "📋 <b>Riwayat Request Topup (5 terakhir)</b>\n\n"
    for i, r in enumerate(my_reqs, start=1):
        text += f"{i}. <b>{_fmt_rp(r.get('amount'))}</b>\n   Status: {status_map.get(r.get('status'), r.get('status'))}\n   Waktu: {r.get('requestedAt')}\n"
        if r.get("processedAt"):
            text += f"   Diproses: {r.get('processedAt')} oleh {r.get('processedBy') or '-'}\n"
        if r.get("note"):
            text += f"   Catatan: {r.get('note')}\n"
        text += "\n"
    send_message(cfg, chat_id, text)


def _handle_list_resellers(chat_id, cfg):
    resellers = reseller_svc.load_all()
    if not resellers:
        send_message(cfg, chat_id, "📭 Belum ada reseller terdaftar.")
        return
    text = f"💼 <b>Daftar Reseller ({len(resellers)})</b>\n\n"
    for r in resellers[:20]:
        text += f"- <b>{r.get('name')}</b> (@{r.get('username')})\n  🆔 <code>{r.get('id')}</code> · 💳 {_fmt_rp(r.get('saldo'))} · 🎫 {r.get('totalVoucher')}\n  {r.get('status') == 'active' and '✅' or '❌'}\n\n"
    text += "\nUntuk topup: /topup [ID] [jumlah] [catatan]"
    send_message(cfg, chat_id, text)


def _cb_topup_select_nominal(chat_id, user_id, username, msg_id, amount, cfg):
    reseller = reseller_svc.get_by_telegram_id(user_id)
    if not reseller:
        tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, "❌ Reseller tidak ditemukan.")
        return
    tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, f"💰 <b>Konfirmasi Request Topup</b>\n\n👤 {reseller.get('name')}\n💵 Jumlah: <b>{_fmt_rp(amount)}</b>\n💳 Saldo saat ini: <b>{_fmt_rp(reseller.get('saldo'))}</b>\n💳 Saldo setelah topup: <b>{_fmt_rp(reseller.get('saldo') + amount)}</b>\n\nKonfirmasi request?", {"reply_markup": {"inline_keyboard": [[{"text": "✅ Ya, Request Sekarang", "callback_data": f"topup_confirm:{amount}"}, {"text": "◀️ Kembali", "callback_data": "topup_back"}, {"text": "❌ Batal", "callback_data": "cancel"}]]}})


def _cb_topup_confirm(chat_id, user_id, username, msg_id, amount, cfg):
    reseller = reseller_svc.get_by_telegram_id(user_id)
    if not reseller:
        tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, "❌ Reseller tidak ditemukan.")
        return
    pending = [r for r in tg_cfg.load_topup_requests() if r.get("telegramId") == user_id and r.get("status") == "pending"]
    if pending:
        tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, f"⏳ Masih ada request pending {_fmt_rp(pending[0].get('amount'))}.\nTunggu admin memproses dulu.")
        return
    tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, f"⏳ Mengirim request topup {_fmt_rp(amount)}...")
    _process_topup_request(chat_id, user_id, username, reseller, amount, "", cfg)


def _cb_topup_custom(chat_id, user_id, msg_id, cfg):
    _set_state(chat_id, {"step": "awaiting_topup_amount"})
    tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, "✏️ <b>Nominal Custom</b>\n\nKetik jumlah topup yang diinginkan:\n<i>Contoh: 75000</i>\n\nMinimal: Rp 1.000", {"reply_markup": {"inline_keyboard": [[{"text": "◀️ Kembali", "callback_data": "topup_back"}, {"text": "❌ Batal", "callback_data": "cancel"}]]}})


def _handle_topup_amount_input(chat_id, user_id, username, text, cfg):
    amount = int(re.sub(r"\D", "", text))
    if amount < 1000:
        send_message(cfg, chat_id, "❌ Nominal tidak valid. Minimal Rp 1.000\n\nKetik ulang nominalnya:")
        return
    _clear_state(chat_id)
    reseller = reseller_svc.get_by_telegram_id(user_id)
    if not reseller:
        return
    send_message(cfg, chat_id, f"💰 <b>Konfirmasi Request Topup</b>\n\n👤 {reseller.get('name')}\n💵 Jumlah: <b>{_fmt_rp(amount)}</b>\n💳 Saldo setelah topup: <b>{_fmt_rp(reseller.get('saldo') + amount)}</b>\n\nKonfirmasi request?", {"reply_markup": {"inline_keyboard": [[{"text": "✅ Ya, Request Sekarang", "callback_data": f"topup_confirm:{amount}"}, {"text": "❌ Batal", "callback_data": "cancel"}]]}})


def _cb_topup_approve(chat_id, user_id, msg_id, req_id, cfg):
    if not _is_admin(cfg, chat_id, user_id):
        tg_api.answer_callback(cfg.get("token", ""), "", "Hanya admin yang bisa approve")
        return
    processor = f"tg:{user_id}"
    req = tg_cfg.claim_topup_request(req_id, processor)
    if not req:
        current = tg_cfg.get_topup_request(req_id)
        if not current:
            tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, "❌ Request tidak ditemukan.")
        else:
            status = current.get("status")
            tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, f"⚠️ Request sudah diproses. Status: {status}")
        return

    result = reseller_svc.topup(req["resellerId"], req.get("amount", 0), "Topup via bot disetujui admin", processor)
    if not result:
        tg_cfg.finish_topup_request(req_id, "rejected", processor, note="Reseller tidak ditemukan")
        tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, "❌ Gagal memproses topup. Reseller tidak ditemukan.")
        return

    tg_cfg.finish_topup_request(req_id, "approved", processor)
    tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, f"✅ <b>Topup DISETUJUI</b>\n\n👤 {req.get('resellerName')}\n💰 +{_fmt_rp(req.get('amount'))}\n💳 Saldo baru: <b>{_fmt_rp(result['reseller'].get('saldo'))}</b>")
    send_message(cfg, req.get("telegramId"), f"🎉 <b>Request Topup Disetujui!</b>\n\n💰 Topup: <b>+{_fmt_rp(req.get('amount'))}</b>\n💳 Saldo sekarang: <b>{_fmt_rp(result['reseller'].get('saldo'))}</b>\n\nKetik /beli untuk mulai belanja! 🛒")


def _cb_topup_reject(chat_id, user_id, msg_id, req_id, cfg):
    if not _is_admin(cfg, chat_id, user_id):
        return
    processor = f"tg:{user_id}"
    req = tg_cfg.claim_topup_request(req_id, processor)
    if not req:
        current = tg_cfg.get_topup_request(req_id)
        if not current:
            tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, "❌ Request tidak ditemukan.")
        else:
            tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, f"⚠️ Request sudah diproses. Status: {current.get('status')}")
        return
    tg_cfg.finish_topup_request(req_id, "rejected", processor)
    tg_api.edit_message(cfg.get("token", ""), chat_id, msg_id, f"❌ <b>Topup DITOLAK</b>\n\n👤 {req.get('resellerName')}\n💰 {_fmt_rp(req.get('amount'))}")
    send_message(cfg, req.get("telegramId"), f"❌ <b>Request Topup Ditolak</b>\n\n💰 Jumlah: {_fmt_rp(req.get('amount'))}\n\nHubungi admin untuk informasi lebih lanjut.")


def _handle_status(chat_id, cfg):
    res = mikrotik_grpc.get_dashboard(cfg.get("sessionId", ""))
    if not res.get("success"):
        send_message(cfg, chat_id, "⚠️ Status router tidak tersedia (gRPC → Go belum aktif).")
        return
    send_message(cfg, chat_id, f"📡 <b>Status Router</b>\n\n🏷️ {res.get('identity', '—')}\n🔧 RouterOS {res.get('version', '—')}\n⏱️ Uptime: {res.get('uptime', '—')}\n🔥 CPU: {res.get('cpu_load', 0)}%")


def _handle_aktif(chat_id, cfg):
    res = mikrotik_grpc.list_hotspot_users(cfg.get("sessionId", ""))
    if not res.get("success"):
        send_message(cfg, chat_id, "⚠️ Layanan router belum tersedia.")
        return
    if not res.get("users"):
        send_message(cfg, chat_id, "📭 Tidak ada user hotspot aktif.")
        return
    text = f"👥 <b>HS Aktif ({len(res['users'])})</b>\n\n<pre>" + "".join(f"{str(i).zfill(2)}. {(u.get('name') or '—')}\n" for i, u in enumerate(res["users"][:25], start=1)) + "</pre>"
    send_message(cfg, chat_id, text)


def _handle_rekap(chat_id, period, cfg):
    send_message(cfg, chat_id, f"📊 <b>Rekap {'Hari Ini' if period == 'today' else 'Bulan Ini'}</b>\n\nRekap penjualan memerlukan akses /system/script di router, yang belum diekspos melalui gRPC → Go. Fitur ini akan aktif setelah Go service menambahkan method tersebut.")


def _handle_pppoe(chat_id, cfg):
    send_message(cfg, chat_id, "🔌 <b>PPPoE Aktif</b>\n\nPPPoE ops belum diekspos melalui gRPC → Go. Akan aktif setelah port.")


def _handle_hapus(chat_id, args, cfg):
    username = args[0] if args else ""
    if not username:
        send_message(cfg, chat_id, "❓ Gunakan: /hapus [username]")
        return
    res = mikrotik_grpc.remove_hotspot_user(cfg.get("sessionId", ""), username)
    if res.get("success"):
        send_message(cfg, chat_id, f"✅ User <code>{username}</code> berhasil dihapus.")
    else:
        send_message(cfg, chat_id, f"❌ Gagal menghapus: {res.get('error')}")
