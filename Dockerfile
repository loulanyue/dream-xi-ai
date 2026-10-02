# ==============================================================================
# Dream XI AI — Multi-Agent Squad Collaboration Platform
# Multi-stage Dockerfile optimized for production deployments
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build stage
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Copy root configurations and package manifests
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY packages ./packages

# Install dependencies and build monorepo packages
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm build

# ------------------------------------------------------------------------------
# Stage 2: Production runtime stage
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install curl for healthchecks
RUN apk add --no-cache curl

# Copy build artifacts and dependencies from builder stage
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

EXPOSE 3000 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Default entrypoint starts Dream XI in-memory coordination server
CMD ["node", "packages/server/dist/main.js", "--memory"]
