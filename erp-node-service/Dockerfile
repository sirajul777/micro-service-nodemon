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
COPY --from=builder /app/proto ./proto
RUN test -f /app/proto/erp_internal.proto
RUN test -f /app/proto/report_internal.proto
EXPOSE 3003
EXPOSE 50053
EXPOSE 50056
CMD ["node", "dist/main.js"]
