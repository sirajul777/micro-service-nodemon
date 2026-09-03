import json
import logging
import os
import time
import grpc
from concurrent import futures

from clients.pb import bot_internal_pb2, bot_internal_pb2_grpc
from services import reseller_service, tg_config_service, tg_bot

log = logging.getLogger("bot-py-service.internal-grpc")
GRPC_ADDR = os.getenv("BOT_GRPC_ADDR", "0.0.0.0:50055")


def _reseller_from_dict(data):
    return bot_internal_pb2.Reseller(
        id=str(data.get("id", "")), name=str(data.get("name", "")),
        username=str(data.get("username", "")), telegram_id=str(data.get("telegramId", "")),
        session_id=str(data.get("sessionId", "")), saldo=float(data.get("saldo", 0) or 0),
        total_voucher=int(data.get("totalVoucher", 0) or 0), total_income=float(data.get("totalIncome", 0) or 0),
        status=str(data.get("status", "")), markup=float(data.get("markup", 0) or 0),
        discount=float(data.get("discount", 0) or 0), created_at=str(data.get("createdAt", "")),
        last_active=str(data.get("lastActive", "")), note=str(data.get("note", "")),
    )


class BotInternalService(bot_internal_pb2_grpc.BotInternalServiceServicer):
    def ListResellers(self, request, context):
        rows = reseller_service.load_all() if request.bot else reseller_service.load_all_plain()
        return bot_internal_pb2.ResellersResponse(success=True, resellers=[_reseller_from_dict(r) for r in rows])

    def GetReseller(self, request, context):
        row = reseller_service.get_by_id(request.id) if request.bot else reseller_service.get_plain_by_id(request.id)
        if not row:
            return bot_internal_pb2.ResellerResponse(success=False, error="Not found")
        return bot_internal_pb2.ResellerResponse(success=True, reseller=_reseller_from_dict(row))

    def UpsertReseller(self, request, context):
        data = {f.name: getattr(request.reseller, f.name) for f in request.reseller.DESCRIPTOR.fields}
        data["telegramId"] = data.pop("telegram_id", "")
        data["sessionId"] = data.pop("session_id", "")
        data["totalVoucher"] = data.pop("total_voucher", 0)
        data["totalIncome"] = data.pop("total_income", 0)
        data["createdAt"] = data.pop("created_at", "")
        data["lastActive"] = data.pop("last_active", "")
        row = reseller_service.upsert(data) if request.bot else reseller_service.upsert_plain(data)
        return bot_internal_pb2.ResellerResponse(success=True, reseller=_reseller_from_dict(row))

    def DeleteReseller(self, request, context):
        ok = reseller_service.delete(request.id) if request.bot else reseller_service.delete_plain(request.id)
        return bot_internal_pb2.MutationResponse(success=ok, error="Not found" if not ok else "", message="Deleted" if ok else "")

    def TopupReseller(self, request, context):
        result = reseller_service.topup(request.id, request.amount, request.note, request.by)
        if not result:
            return bot_internal_pb2.ResellerMutationResponse(success=False, error="Reseller tidak ditemukan")
        return bot_internal_pb2.ResellerMutationResponse(success=True, reseller=_reseller_from_dict(result["reseller"]))

    def ListResellerLogs(self, request, context):
        rows = reseller_service.load_logs(request.reseller_id or None, request.limit or 100)
        logs = []
        for r in rows:
            logs.append(bot_internal_pb2.ResellerLog(
                id=int(r.get("id", 0) or 0), reseller_id=str(r.get("reselerId", "")), amount=float(r.get("amount", 0) or 0),
                type=str(r.get("type", "")), note=str(r.get("note", "")), by=str(r.get("by", "")),
                at=str(r.get("at", "")), balance_before=float(r.get("balanceBefore", 0) or 0),
                balance_after=float(r.get("balanceAfter", 0) or 0),
            ))
        return bot_internal_pb2.ResellerLogsResponse(success=True, logs=logs)

    def ListTelegramConfigs(self, request, context):
        rows = tg_config_service.load_all()
        configs = [bot_internal_pb2.TelegramConfig(
            id=str(r.get("id", "")), token=str(r.get("token", "")), chat_id=str(r.get("chatId", "")),
            session_id=str(r.get("sessionId", "")), notif_sale=bool(r.get("notifSale", False)),
            notif_daily=bool(r.get("notifDaily", False)), daily_time=str(r.get("dailyTime", "")),
            bot_enabled=bool(r.get("botEnabled", False)), allowed_users=[str(x) for x in r.get("allowedUsers", [])],
            default_profile=str(r.get("defaultProfile", "")), welcome_msg=str(r.get("welcomeMsg", "")),
        ) for r in rows]
        return bot_internal_pb2.TelegramConfigsResponse(success=True, configs=configs)

    def GetTelegramConfig(self, request, context):
        row = tg_config_service.get_config(request.id)
        if not row:
            return bot_internal_pb2.TelegramConfigResponse(success=False, error="Not found")
        return bot_internal_pb2.TelegramConfigResponse(success=True, config=self._cfg(row))

    def _cfg(self, r):
        return bot_internal_pb2.TelegramConfig(
            id=str(r.get("id", "")), token=str(r.get("token", "")), chat_id=str(r.get("chatId", "")),
            session_id=str(r.get("sessionId", "")), notif_sale=bool(r.get("notifSale", False)),
            notif_daily=bool(r.get("notifDaily", False)), daily_time=str(r.get("dailyTime", "")),
            bot_enabled=bool(r.get("botEnabled", False)), allowed_users=[str(x) for x in r.get("allowedUsers", [])],
            default_profile=str(r.get("defaultProfile", "")), welcome_msg=str(r.get("welcomeMsg", "")),
        )

    def SaveTelegramConfig(self, request, context):
        c = request.config
        cfg = {
            "id": c.id, "token": c.token, "chatId": c.chat_id, "sessionId": c.session_id,
            "notifSale": c.notif_sale, "notifDaily": c.notif_daily, "dailyTime": c.daily_time,
            "botEnabled": c.bot_enabled, "allowedUsers": list(c.allowed_users),
            "defaultProfile": c.default_profile, "welcomeMsg": c.welcome_msg,
        }
        tg_config_service.save_config(cfg)
        return bot_internal_pb2.TelegramConfigResponse(success=True, config=self._cfg(tg_config_service.get_config(c.id)))

    def DeleteTelegramConfig(self, request, context):
        tg_config_service.delete_config(request.id)
        return bot_internal_pb2.MutationResponse(success=True, message="Deleted")

    def TestTelegram(self, request, context):
        cfg = tg_config_service.get_config(request.id or None)
        if not cfg:
            return bot_internal_pb2.MutationResponse(success=False, error="Konfigurasi Telegram tidak ditemukan")
        try:
            result = tg_bot.send_message(cfg, request.chat_id or cfg.get("chatId"), request.message or "Test dari MikHMon")
            ok = bool(result.get("ok")) if isinstance(result, dict) else bool(result)
            return bot_internal_pb2.MutationResponse(success=ok, message="Pesan terkirim" if ok else "Gagal mengirim pesan")
        except Exception as e:
            return bot_internal_pb2.MutationResponse(success=False, error=str(e))

    def BroadcastTelegram(self, request, context):
        message = (request.message or "").strip()
        if not message:
            return bot_internal_pb2.MutationResponse(success=False, error="Pesan broadcast kosong")

        cfg = tg_config_service.get_config(request.id or None)
        if not cfg or not cfg.get("token"):
            return bot_internal_pb2.MutationResponse(success=False, error="Konfigurasi Telegram tidak ditemukan atau token kosong")
        if not cfg.get("botEnabled"):
            return bot_internal_pb2.MutationResponse(success=False, error="Bot Telegram sedang disabled")

        recipients = []
        seen = set()
        for reseller in reseller_service.load_all():
            telegram_id = str(reseller.get("telegramId") or "").strip()
            if reseller.get("status") != "active" or not telegram_id or telegram_id in seen:
                continue
            seen.add(telegram_id)
            recipients.append(telegram_id)

        if not recipients:
            return bot_internal_pb2.MutationResponse(success=False, error="Tidak ada agen aktif dengan Telegram ID")

        delivered = 0
        failed = 0
        for chat_id in recipients[:1000]:
            try:
                result = tg_bot.send_message(cfg, chat_id, message)
                ok = bool(result.get("ok")) if isinstance(result, dict) else bool(result)
                if ok:
                    delivered += 1
                else:
                    failed += 1
            except Exception as exc:
                failed += 1
                log.warning("Telegram broadcast failed for chat %s: %s", chat_id, exc)
            time.sleep(0.05)

        total = min(len(recipients), 1000)
        success = delivered > 0
        message_result = f"Broadcast selesai: {delivered} berhasil, {failed} gagal dari {total} agen"
        return bot_internal_pb2.MutationResponse(success=success, message=message_result, error="Sebagian pesan gagal terkirim" if failed else "")

    def SendTelegramReminder(self, request, context):
        cfg = tg_config_service.get_config(request.id or None)
        if not cfg:
            return bot_internal_pb2.MutationResponse(success=False, error="Konfigurasi Telegram tidak ditemukan")
        if not cfg.get("token") or not cfg.get("botEnabled"):
            return bot_internal_pb2.MutationResponse(success=False, error="Bot Telegram tidak aktif atau token kosong")
        chat_id = str(request.chat_id or "").strip()
        message = str(request.message or "").strip()
        if not chat_id:
            return bot_internal_pb2.MutationResponse(success=False, error="Telegram chat ID kosong")
        if not message:
            return bot_internal_pb2.MutationResponse(success=False, error="Pesan reminder kosong")
        try:
            result = tg_bot.send_message(cfg, chat_id, message)
            ok = bool(result.get("ok")) if isinstance(result, dict) else bool(result)
            return bot_internal_pb2.MutationResponse(
                success=ok,
                message="Reminder terkirim" if ok else "Gagal mengirim reminder",
                error="Telegram API menolak pesan" if not ok else "",
            )
        except Exception as exc:
            return bot_internal_pb2.MutationResponse(success=False, error=str(exc))

    def ListTelegramLogs(self, request, context):
        rows = tg_config_service.load_topup_requests()
        logs = [bot_internal_pb2.TelegramLog(id=str(r.get("id", "")), payload=json.dumps(r, default=str)) for r in rows]
        return bot_internal_pb2.TelegramLogsResponse(success=True, logs=logs)


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=8))
    bot_internal_pb2_grpc.add_BotInternalServiceServicer_to_server(BotInternalService(), server)
    server.add_insecure_port(GRPC_ADDR)
    server.start()
    log.info("internal gRPC listening on %s", GRPC_ADDR)
    return server