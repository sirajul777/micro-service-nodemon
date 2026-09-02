"""Scheduled Telegram daily sales reports.

Uses the persisted bot-reseller ledger so the report remains available even
when no payment event is emitted during the day. Each configured bot gets at
most one report per local calendar date.
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime

from services import reseller_service as reseller_svc
from services import tg_api, tg_config_service as tg_cfg

log = logging.getLogger("bot-py-service.tg-daily-report")

_running = False
_thread: threading.Thread | None = None


def _parse_daily_time(value: str) -> tuple[int, int] | None:
    try:
        hour, minute = (int(part) for part in (value or "").strip().split(":", 1))
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return hour, minute
    except (TypeError, ValueError):
        pass
    return None


def _build_report(config_id: str, now: datetime, logs: list[dict]) -> str:
    day = now.date()
    start = datetime(day.year, day.month, day.day)
    start_iso = start.isoformat()

    rows = [r for r in logs if r.get("type") == "purchase" and (r.get("at") or "") >= start_iso]
    count = len(rows)
    total = sum(float(r.get("amount") or 0) * -1 for r in rows if float(r.get("amount") or 0) < 0)

    reseller_ids = {r.get("reselerId") for r in rows if r.get("reselerId")}
    reseller_names = {}
    for reseller_id in reseller_ids:
        reseller = reseller_svc.get_by_id(reseller_id)
        if reseller:
            reseller_names[reseller_id] = reseller.get("name") or reseller_id

    lines = [
        "📊 <b>Laporan Harian</b>",
        "",
        f"Tanggal: <b>{day.strftime('%d/%m/%Y')}</b>",
        f"Transaksi: <b>{count}</b>",
        f"Total penjualan: <b>Rp {int(round(total)):,}</b>".replace(",", "."),
    ]

    if rows:
        lines.append("")
        lines.append("<b>Top reseller</b>")
        totals: dict[str, float] = {}
        for row in rows:
            reseller_id = row.get("reselerId") or "-"
            amount = float(row.get("amount") or 0)
            totals[reseller_id] = totals.get(reseller_id, 0) + max(0, -amount)
        for reseller_id, amount in sorted(totals.items(), key=lambda item: item[1], reverse=True)[:5]:
            name = reseller_names.get(reseller_id, reseller_id)
            lines.append(f"• {name}: Rp {int(round(amount)):,}".replace(",", "."))
    else:
        lines.extend(["", "Belum ada transaksi reseller hari ini."])

    return "\n".join(lines)


def _already_sent(config_id: str, date_key: str) -> bool:
    state = tg_cfg.get_config(config_id) or {}
    return state.get("dailyLastSent") == date_key


def _mark_sent(config_id: str, date_key: str):
    state = tg_cfg.get_config(config_id)
    if not state:
        return
    tg_cfg.save_config({"id": config_id, "dailyLastSent": date_key})


def run_once(now: datetime | None = None) -> int:
    now = now or datetime.now().astimezone()
    sent = 0
    logs = reseller_svc.load_logs(limit=5000)
    date_key = now.date().isoformat()

    for cfg in tg_cfg.load_all():
        if not cfg.get("botEnabled") or not cfg.get("notifDaily"):
            continue
        if not cfg.get("token") or not cfg.get("chatId"):
            continue
        parsed = _parse_daily_time(cfg.get("dailyTime", "23:59"))
        if not parsed or (parsed[0], parsed[1]) != (now.hour, now.minute):
            continue
        if _already_sent(cfg.get("id", ""), date_key):
            continue

        text = _build_report(cfg.get("id", ""), now, logs)
        try:
            result = tg_api.send_message(cfg["token"], cfg["chatId"], text)
            ok = bool(result.get("ok")) if isinstance(result, dict) else bool(result)
        except Exception as exc:
            log.warning("Daily Telegram report failed for config %s: %s", cfg.get("id", ""), exc)
            ok = False
        if ok:
            _mark_sent(cfg.get("id", ""), date_key)
            sent += 1
            log.info("Daily Telegram report sent for config %s", cfg.get("id", ""))
    return sent


def _loop():
    global _running
    while _running:
        try:
            now = datetime.now().astimezone()
            run_once(now)
        except Exception as exc:
            log.warning("Daily report scheduler error: %s", exc)
        time.sleep(max(1, 60 - datetime.now().second))


def start():
    global _running, _thread
    if _running:
        return
    _running = True
    _thread = threading.Thread(target=_loop, name="telegram-daily-report", daemon=True)
    _thread.start()
    log.info("Telegram daily report scheduler started")


def stop():
    global _running
    _running = False
