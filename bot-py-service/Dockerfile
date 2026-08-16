FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN python -m grpc_tools.protoc -I./proto --python_out=./clients/pb --grpc_python_out=./clients/pb ./proto/bot_internal.proto \
    && sed -i 's/^import bot_internal_pb2 /from . import bot_internal_pb2 /' clients/pb/bot_internal_pb2_grpc.py

EXPOSE 8082 50055
CMD ["python", "main.py"]
