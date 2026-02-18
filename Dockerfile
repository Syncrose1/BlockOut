# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Only copy what the server needs at runtime
COPY package*.json ./
RUN npm ci --omit=dev

COPY server/ ./server/
COPY --from=builder /app/dist ./dist

# Data is stored here — mount a volume to persist across container restarts
RUN mkdir -p /app/data
ENV DATA_DIR=/app/data

# Optional: set BLOCKOUT_TOKEN to require a bearer token for API access
# ENV BLOCKOUT_TOKEN=changeme

EXPOSE 3001

CMD ["node", "server/index.js"]
