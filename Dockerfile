# Use Bun image for faster installs and serving
FROM oven/bun:1.2.20-alpine

# Install curl and Node.js
RUN apk add --no-cache curl nodejs npm python3 make g++

# Set env vars
ENV NODE_ENV=production
ENV EXPO_NO_TELEMETRY=1

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN NODE_ENV=development bun install --frozen-lockfile

# Copy source
COPY . .

# Build static web export
RUN NODE_ENV=production node ./node_modules/.bin/expo export --platform web --output-dir dist

# Run post-build script
RUN node scripts/post-build.js

# Clean up build tools
RUN apk del python3 make g++

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/ || exit 1

# Use our custom server that handles React Native Web properly
CMD ["bun", "run", "serve:dist"]
