"""gRPC client -> mikrotik-go-service (RouterService)."""
import logging

import grpc
from google.protobuf.json_format import MessageToDict

from clients.pb import router_pb2, router_pb2_grpc
from config import MIKROTIK_GRPC_ADDR

log = logging.getLogger("bot-py-service.mikrotik-grpc")

_DEADLINE_SECONDS = 15


def _stub():
    channel = grpc.insecure_channel(MIKROTIK_GRPC_ADDR)
    return router_pb2_grpc.RouterServiceStub(channel), channel


def _to_dict(msg) -> dict:
    try:
        return MessageToDict(msg, preserving_proto_field_name=True, always_print_fields_with_no_presence=True)
    except TypeError:
        return MessageToDict(msg, preserving_proto_field_name=True, including_default_value_fields=True)


def _call(rpc_name: str, request, default_error: dict) -> dict:
    stub, channel = _stub()
    try:
        resp = getattr(stub, rpc_name)(request, timeout=_DEADLINE_SECONDS)
        return _to_dict(resp)
    except grpc.RpcError as e:
        log.error("gRPC %s failed: %s", rpc_name, e)
        result = dict(default_error)
        result["error"] = f"mikrotik-go-service unreachable or errored: {e.details() or e.code()}"
        return result
    finally:
        channel.close()


def test_connect(session_id: str) -> dict:
    return _call("TestConnect", router_pb2.TestConnectRequest(session_id=session_id), {"success": False})


def get_dashboard(session_id: str) -> dict:
    return _call("GetDashboard", router_pb2.GetDashboardRequest(session_id=session_id), {"success": False})


def list_active_hotspot_users(session_id: str) -> dict:
    return _call("ListActiveHotspotUsers", router_pb2.ListActiveRequest(session_id=session_id), {"success": False, "users": []})


def list_hotspot_users(session_id: str, profile: str = "", comment: str = "") -> dict:
    return _call("ListHotspotUsers", router_pb2.ListHotspotUsersRequest(session_id=session_id, profile=profile, comment=comment), {"success": False, "users": []})


def add_hotspot_user(session_id: str, name: str, password: str, profile: str, validity: str = "", comment: str = "") -> dict:
    return _call("AddHotspotUser", router_pb2.AddHotspotUserRequest(session_id=session_id, name=name, password=password, profile=profile, comment=comment, limit_uptime=validity), {"success": False})


def remove_hotspot_user(session_id: str, username: str) -> dict:
    return _call("RemoveHotspotUser", router_pb2.RemoveHotspotUserRequest(session_id=session_id, name=username), {"success": False})


def list_hotspot_profiles(session_id: str) -> dict:
    return _call("ListHotspotProfiles", router_pb2.ListProfilesRequest(session_id=session_id), {"success": False, "profiles": []})


def get_hotspot_profile(session_id: str, name: str) -> dict:
    return _call("GetHotspotProfile", router_pb2.GetProfileRequest(session_id=session_id, name=name), {"success": False})


def list_ppp_active(session_id: str) -> dict:
    """List active PPPoE sessions through the real RouterService RPC."""
    return _call("ListPppActive", router_pb2.ListPppActiveRequest(session_id=session_id), {"success": False, "connections": []})
