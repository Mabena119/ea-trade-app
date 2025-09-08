# Use Bun image to run scripts and serve static build
FROM oven/bun:1.2.20-alpine

# Install curl for health checks and build tools for native deps
RUN apk add --no-cache curl python3 make g++

# Set env vars (override NODE_ENV during install below)
ENV NODE_ENV=production
ENV EXPO_NO_TELEMETRY=1

WORKDIR /app

# Install dependencies first (better layer cache)
COPY package.json bun.lock ./
# Ensure devDependencies (e.g., @expo/cli) are installed for the build step
RUN NODE_ENV=development bun install --frozen-lockfile

# Copy the rest of the source
COPY . .

# Build static web export to dist/
RUN bun run build:web

# Remove build tools to slim image
RUN apk del python3 make g++

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Change ownership of the app directory
RUN chown -R nextjs:nodejs /app
USER nextjs

# Serve the static site
ENV PORT=3000
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:$PORT/ || exit 1

CMD ["bun", "run", "serve:dist"]


