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

# router.proto is the canonical RouterService contract.
RUN grep -q 'rpc ListSellingScripts(ListSellingScriptsRequest) returns (ListSellingScriptsResponse);' proto/router.proto
RUN grep -q 'rpc ListSessions(ListSessionsRequest) returns (ListSessionsResponse);' proto/router.proto

RUN rm -f proto/router.pb.go proto/router_grpc.pb.go
RUN rm -f proto/reportproto/report_router.pb.go proto/reportproto/report_router_grpc.pb.go
RUN protoc \
      --go_out=. \
      --go_opt=paths=source_relative \
      --go-grpc_out=. \
      --go-grpc_opt=paths=source_relative \
      proto/router.proto
RUN protoc \
      --go_out=. \
      --go_opt=paths=source_relative \
      --go-grpc_out=. \
      --go-grpc_opt=paths=source_relative \
      proto/reportproto/report_router.proto

RUN grep -q 'type UnimplementedRouterServiceServer struct' proto/router_grpc.pb.go
RUN grep -q 'ListSellingScripts' proto/router_grpc.pb.go
RUN grep -q 'type UnimplementedReportRouterServiceServer struct' proto/reportproto/report_router_grpc.pb.go
RUN grep -q 'ListSellingScripts' proto/reportproto/report_router_grpc.pb.go

RUN CGO_ENABLED=0 GOOS=linux go build -o mikrotik-service .

# Stage 2: run minimal
FROM alpine:3.19
WORKDIR /app
COPY --from=builder /app/mikrotik-service .
EXPOSE 50051 8081
CMD ["./mikrotik-service"]
