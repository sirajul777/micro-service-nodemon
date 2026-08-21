# Stage 1: build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: run
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Runtime gRPC contracts used by payment-service and its clients.
COPY --from=builder /app/proto/payment_internal.proto /app/proto/payment_internal.proto
COPY --from=builder /app/proto/erp_internal.proto /app/erp-proto/erp_internal.proto
COPY --from=builder /app/proto/auth.proto /app/auth-proto/auth.proto

RUN test -f /app/proto/payment_internal.proto
RUN test -f /app/erp-proto/erp_internal.proto
RUN test -f /app/auth-proto/auth.proto

EXPOSE 3002 50054
CMD ["node", "dist/main.js"]
