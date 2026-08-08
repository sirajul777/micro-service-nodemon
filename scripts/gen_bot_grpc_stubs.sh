#!/usr/bin/env bash
# Regenerates bot-py-service's Python gRPC stubs from
# mikrotik-go-service/proto/router.proto. Run this after changing the proto
# (also regenerate the Go/Node.js side — see mikrotik-go-service and the
# erp/payment-service proto/ copies).
set -euo pipefail
cd "$(dirname "$0")/.."

cp mikrotik-go-service/proto/router.proto bot-py-service/proto/router.proto
mkdir -p bot-py-service/clients/pb

python3 -m grpc_tools.protoc \
  -I bot-py-service/proto \
  --python_out=bot-py-service/clients/pb \
  --grpc_python_out=bot-py-service/clients/pb \
  bot-py-service/proto/router.proto

# grpc_tools.protoc doesn't emit __init__.py, and doesn't make the output a
# package on its own.
touch bot-py-service/clients/pb/__init__.py

# grpc_tools.protoc emits an absolute "import router_pb2" in the _grpc.py
# file instead of a package-relative one; fix it so `from clients.pb import
# router_pb2_grpc` works when bot-py-service is run as a package.
sed -i 's/^import router_pb2 as router__pb2$/from . import router_pb2 as router__pb2/' \
  bot-py-service/clients/pb/router_pb2_grpc.py

echo "Regenerated bot-py-service/clients/pb/router_pb2.py and router_pb2_grpc.py"
