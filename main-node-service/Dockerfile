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
COPY --from=builder /app/views ./views
COPY --from=builder /app/public ./public
COPY --from=builder /app/../auth-node-service/proto ./auth-proto
COPY --from=builder /app/src/proto ./erp-proto
COPY --from=builder /app/src/proto/router.proto ./router-proto/router.proto
COPY --from=builder /app/../bot-py-service/proto/bot_internal.proto ./bot-proto/bot_internal.proto
EXPOSE 8080
CMD ["node", "dist/main.js"]
