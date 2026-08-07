# Stage 1: build binary
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Copy dependency manifests first
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o mikrotik-service .

# Stage 2: run minimal
FROM alpine:3.19
WORKDIR /app
COPY --from=builder /app/mikrotik-service .
EXPOSE 50051 8081
CMD ["./mikrotik-service"]
