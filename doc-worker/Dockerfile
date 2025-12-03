FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build
RUN npm run build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget

# Copy package files and install production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built files
COPY --from=builder /app/dist ./dist

# Create data directory for reading sessions
RUN mkdir -p /data && chown node:node /data

# Environment defaults
ENV NODE_ENV=production
ENV DATA_PATH=/data
ENV REDIS_URL=redis://redis:6379
ENV BASIC_MODEL=claude-3-5-haiku-20241022
ENV PREMIUM_MODEL=claude-3-5-sonnet-20241022
ENV IDLE_TIMEOUT_MINUTES=10
ENV BATCH_SIZE=5
ENV BATCH_WINDOW_SECONDS=30
ENV MAX_RETRIES=3
ENV HEALTH_PORT=3002

# Health check endpoint
EXPOSE 3002

# Run as non-root
USER node

ENTRYPOINT ["node", "dist/index.js"]

