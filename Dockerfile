# Use Bun image for faster installs
FROM oven/bun:1.2.20-alpine

# Install curl for health checks and Node.js for Expo
RUN apk add --no-cache curl nodejs npm

# Set env vars
ENV NODE_ENV=production
ENV EXPO_NO_TELEMETRY=1
ENV EXPO_USE_FAST_RESOLVER=1

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port (Render will inject PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/ || exit 1

# Start Expo web server in production mode
CMD ["npx", "expo", "start", "--web", "--port", "3000", "--no-dev", "--minify"]
