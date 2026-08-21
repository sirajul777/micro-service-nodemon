FROM node:22-alpine AS builder
WORKDIR /app

COPY main-node-service/package.json main-node-service/package-lock.json* ./
RUN npm install

COPY main-node-service/ .
COPY auth-node-service/proto ./shared-protos/auth
COPY bot-py-service/proto ./shared-protos/bot
COPY erp-node-service/proto ./shared-protos/erp
COPY payment-service/proto ./shared-protos/payment

RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/views ./views
COPY --from=builder /app/public ./public

COPY --from=builder /app/shared-protos/auth ./auth-proto
COPY --from=builder /app/shared-protos/bot ./bot-proto
COPY --from=builder /app/shared-protos/erp ./erp-proto
COPY --from=builder /app/shared-protos/payment ./payment-proto

RUN test -f /app/erp-proto/erp_internal.proto
RUN test -f /app/auth-proto/auth.proto
RUN test -f /app/payment-proto/payment_internal.proto

EXPOSE 8080
CMD ["node", "dist/main.js"]
