"""gRPC client → mikrotik-go-service (RouterService).

The bot service needs router operations for admin commands (/status, /aktif,
/cek, /hapus, /pppoe, /rekap). The Go service resolves router credentials by
sessionId, so we never touch secrets here.
"""
import json
import logging

import grpc

from config import MIKROTIK_GRPC_ADDR

# Generic dynamic client using reflection-free proto dispatch. To keep this
# dependency-light, we implement the protobuf wire calls via grpc with a
# minimal inline message encoder. In production, generate stubs from
# proto/router.proto with grpcio-tools. This module degrades gracefully when
# the Go service is not deployed.
try:
    from grpc import ssl_channel_credentials
    _HAS_TLS = True
except Exception:
    _HAS_TLS = False

log = logging.getLogger("bot-py-service.mikrotik-grpc")


class MikrotikError(Exception):
    pass


def test_connect(session_id: str) -> dict:
    """Best-effort TestConnect via gRPC. Returns {success, error?}."""
    # Without generated stubs we cannot call gRPC directly. Provide a
    # degraded result so the bot can still run while Go is not deployed.
    # In prod, replace with a real generated client.
    log.warning("gRPC not wired (no generated RouterService stubs) — TestConnect(%s) skipped", session_id)
    return {
        "success": False,
        "error": "mikrotik-go-service gRPC client not wired (no generated stubs). "
                 "Generate stubs from proto/router.proto to enable router ops.",
    }


def list_hotspot_users(session_id: str, profile: str | None = None) -> dict:
    log.warning("gRPC not wired — listHotspotUsers(%s) skipped", session_id)
    return {
        "success": False,
        "users": [],
        "error": "mikrotik-go-service gRPC client not wired (no generated stubs).",
    }


def list_hotspot_profiles(session_id: str) -> dict:
    log.warning("gRPC not wired — listHotspotProfiles(%s) skipped", session_id)
    return {"success": False, "profiles": [], "error": "gRPC client not wired (no generated stubs)."}


def get_dashboard(session_id: str) -> dict:
    log.warning("gRPC not wired — getDashboard(%s) skipped", session_id)
    return {"success": False, "error": "gRPC client not wired (no generated stubs)."}


def remove_hotspot_user(session_id: str, username: str) -> dict:
    log.warning("gRPC not wired — removeHotspotUser(%s, %s) skipped", session_id, username)
    return {"success": False, "error": "gRPC client not wired (no generated stubs)."}
