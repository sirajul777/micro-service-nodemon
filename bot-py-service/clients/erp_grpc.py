"""gRPC client for erp-node-service internal APIs."""
from __future__ import annotations

import logging
from pathlib import Path

import grpc

from config import ERP_GRPC_ADDR
from clients.pb import erp_internal_pb2, erp_internal_pb2_grpc

log = logging.getLogger("bot-py-service.erp-grpc")


def _voucher_type_to_dict(item) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "price": item.price,
        "profile": item.profile,
        "duration": item.duration,
        "codeLength": item.code_length,
        "codeFormat": item.code_format,
        "maxPerOrder": item.max_per_order,
        "userType": item.user_type,
        "active": item.active,
        "createdAt": item.created_at,
    }


def get_active_voucher_types() -> list[dict]:
    try:
        with grpc.insecure_channel(ERP_GRPC_ADDR) as channel:
            stub = erp_internal_pb2_grpc.ErpInternalServiceStub(channel)
            response = stub.GetActiveVoucherTypes(
                erp_internal_pb2.GetActiveVoucherTypesRequest(),
                timeout=10,
            )
        if not response.success:
            log.error("ERP GetActiveVoucherTypes failed: %s", response.error)
            return []
        return [_voucher_type_to_dict(item) for item in response.voucher_types]
    except grpc.RpcError as exc:
        log.error("ERP GetActiveVoucherTypes gRPC failed: %s", exc)
        return []
    except Exception:
        log.exception("ERP GetActiveVoucherTypes unexpected failure")
        return []


def get_voucher_type(voucher_type_id: str) -> dict | None:
    try:
        with grpc.insecure_channel(ERP_GRPC_ADDR) as channel:
            stub = erp_internal_pb2_grpc.ErpInternalServiceStub(channel)
            response = stub.GetVoucherType(
                erp_internal_pb2.GetVoucherTypeRequest(id=str(voucher_type_id)),
                timeout=10,
            )
        if not response.success or not response.voucher_type.id:
            return None
        return _voucher_type_to_dict(response.voucher_type)
    except grpc.RpcError as exc:
        log.error("ERP GetVoucherType(%s) gRPC failed: %s", voucher_type_id, exc)
        return None
    except Exception:
        log.exception("ERP GetVoucherType(%s) unexpected failure", voucher_type_id)
        return None
