"""gRPC client for auth-node-service internal token validation."""
from __future__ import annotations

import logging

import grpc

from config import AUTH_GRPC_ADDR
from clients.pb import auth_pb2, auth_pb2_grpc

log = logging.getLogger("bot-py-service.auth-grpc")


def validate_token(token: str) -> bool:
    try:
        with grpc.insecure_channel(AUTH_GRPC_ADDR) as channel:
            stub = auth_pb2_grpc.AuthServiceStub(channel)
            response = stub.ValidateToken(
                auth_pb2.ValidateTokenRequest(token=token),
                timeout=5,
            )
        return bool(response.success)
    except grpc.RpcError as exc:
        log.warning("Auth ValidateToken gRPC failed: %s", exc)
        return False
    except Exception:
        log.exception("Auth ValidateToken unexpected failure")
        return False
