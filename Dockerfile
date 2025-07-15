# Multi-stage production Dockerfile for Sentinel
FROM node:18-alpine AS base

# Set working directory
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S sentinel -u 1001

# Copy package files
COPY package*.json ./

# Development stage
FROM base AS development
ENV NODE_ENV=development
RUN npm ci
COPY . .
RUN npm run build
USER sentinel
EXPOSE 3000 3001
CMD ["dumb-init", "node", "bin/sentinel.js", "watch"]

# Production dependencies stage
FROM base AS deps
ENV NODE_ENV=production
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM base AS production
ENV NODE_ENV=production

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY --chown=sentinel:nodejs . .

# Build application
RUN npm run build

# Remove development files
RUN rm -rf test/ benchmark/ docs/ *.md

# Create logs directory
RUN mkdir -p logs && chown -R sentinel:nodejs logs

# Switch to non-root user
USER sentinel

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('./index').getInstance().getHealth()" || exit 1

# Expose ports
EXPOSE 3000 3001

# Default command
CMD ["dumb-init", "node", "index.js"]

# Production monitoring stage
FROM production AS monitoring
ENV SENTINEL_MONITORING_ENABLED=true
ENV SENTINEL_DETECTION_ENABLED=true
ENV SENTINEL_REPORTING_FILE=/app/logs/sentinel.log
CMD ["dumb-init", "node", "bin/sentinel.js", "dashboard", "--port", "3001"]