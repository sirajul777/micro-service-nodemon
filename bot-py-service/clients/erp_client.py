"""Compatibility facade for the bot's ERP voucher-type client.

Internal bot → ERP communication is gRPC-only. The historic module name is
kept so existing imports continue to work without changing call sites.
"""

from clients.erp_grpc import get_active_voucher_types, get_voucher_type

__all__ = ["get_active_voucher_types", "get_voucher_type"]
