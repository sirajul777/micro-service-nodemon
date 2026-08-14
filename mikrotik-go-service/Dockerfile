# Stage 1: build binary
FROM golang:1.25-alpine AS builder

WORKDIR /app

RUN apk add --no-cache protobuf
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.12 \
    && go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.6.2
ENV PATH="/go/bin:${PATH}"

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# router.proto is the single source of truth. Do not trust checked-in generated files.
RUN grep -q 'rpc ListSessions(ListSessionsRequest) returns (ListSessionsResponse);' proto/router.proto
RUN grep -q 'rpc ListDhcpLeases(ListDhcpLeasesRequest) returns (ListDhcpLeasesResponse);' proto/router.proto
RUN grep -q 'rpc ListSchedulers(ListSchedulersRequest) returns (ListSchedulersResponse);' proto/router.proto
RUN grep -q 'rpc ListLogs(ListLogsRequest) returns (ListLogsResponse);' proto/router.proto

RUN rm -f proto/router.pb.go proto/router_grpc.pb.go
RUN protoc \
      --go_out=. \
      --go_opt=paths=source_relative \
      --go-grpc_out=. \
      --go-grpc_opt=paths=source_relative \
      proto/router.proto

# Validate generated protobuf API without depending on whitespace/formatting.
RUN grep -q 'type UnimplementedRouterServiceServer struct' proto/router_grpc.pb.go
RUN grep -q 'ListSessions' proto/router_grpc.pb.go
RUN grep -q 'ListDhcpLeases' proto/router_grpc.pb.go
RUN grep -q 'ListSchedulers' proto/router_grpc.pb.go
RUN grep -q 'ListLogs' proto/router_grpc.pb.go
RUN grep -q '_RouterService_ListSessions_Handler' proto/router_grpc.pb.go

RUN CGO_ENABLED=0 GOOS=linux go build -o mikrotik-service .

# Stage 2: run minimal
FROM alpine:3.19
WORKDIR /app
COPY --from=builder /app/mikrotik-service .
EXPOSE 50051 8081
CMD ["./mikrotik-service"]
