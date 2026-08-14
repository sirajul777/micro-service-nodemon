# Stage 1: build binary
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Protobuf generator toolchain must match the checked-in generated files.
RUN apk add --no-cache protobuf
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.12 \
    && go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.6.2
ENV PATH="/go/bin:${PATH}"

# Copy dependency manifests first
COPY go.mod go.sum ./
RUN go mod download

# Copy source and regenerate protobuf bindings from the authoritative schema.
COPY . .
RUN rm -f proto/router.pb.go proto/router_grpc.pb.go
RUN protoc \
      --go_out=. \
      --go_opt=paths=source_relative \
      --go-grpc_out=. \
      --go-grpc_opt=paths=source_relative \
      proto/router.proto

RUN grep -q 'type UnimplementedRouterServiceServer struct' proto/router_grpc.pb.go
RUN grep -q 'ListSessions(context.Context, \*ListSessionsRequest)' proto/router_grpc.pb.go
RUN grep -q 'ListDhcpLeases(context.Context, \*ListDhcpLeasesRequest)' proto/router_grpc.pb.go
RUN grep -q 'ListSchedulers(context.Context, \*ListSchedulersRequest)' proto/router_grpc.pb.go
RUN grep -q 'ListLogs(context.Context, \*ListLogsRequest)' proto/router_grpc.pb.go
RUN grep -q '{MethodName: "ListSessions", Handler: _RouterService_ListSessions_Handler}' proto/router_grpc.pb.go

RUN CGO_ENABLED=0 GOOS=linux go build -o mikrotik-service .

# Stage 2: run minimal
FROM alpine:3.19
WORKDIR /app
COPY --from=builder /app/mikrotik-service .
EXPOSE 50051 8081
CMD ["./mikrotik-service"]
