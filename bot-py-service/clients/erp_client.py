"""HTTP client → erp-node-service (voucher types).

The bot needs the list of voucher types (and their on-login price/validity) to
render the /beli and /profil menus. It reads them from erp-service rather than
from the router directly (router profile reading is owned by mikrotik-go-service).
"""
import logging

import requests

from config import ERP_BASE_URL

log = logging.getLogger("bot-py-service.erp-client")


def get_active_voucher_types() -> list[dict]:
    """GET /voucher/types/active. Returns list of {id,name,price,profile,duration,codeLength,codeFormat,userType}."""
    try:
        resp = requests.get(f"{ERP_BASE_URL}/voucher/types/active", timeout=10)
        resp.raise_for_status()
        data = resp.json()
        # erp returns either the raw array or { success, data }
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and isinstance(data.get("data"), list):
            return data["data"]
        return []
    except requests.RequestException as e:
        log.error(f"ERP get_active_voucher_types failed: {e}")
        return []


def get_voucher_type(voucher_type_id: str) -> dict | None:
    """GET /voucher/types/:id."""
    try:
        resp = requests.get(f"{ERP_BASE_URL}/voucher/types/{voucher_type_id}", timeout=10)
        if resp.status_code != 200:
            return None
        data = resp.json()
        if isinstance(data, dict) and data.get("error"):
            return None
        return data
    except requests.RequestException as e:
        log.error(f"ERP get_voucher_type({voucher_type_id}) failed: {e}")
        return None
