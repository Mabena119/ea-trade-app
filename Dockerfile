# Use Bun image to run scripts and serve static build
FROM oven/bun:1.2.20-alpine

# Install curl for health checks, Node.js for Expo CLI, and build tools for native deps
RUN apk add --no-cache curl nodejs npm python3 make g++

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

# Build static web export to dist/ using Node (avoids Bun sideEffects warning)
RUN node ./node_modules/.bin/expo export --platform web

# Run post-build script to set up PWA manifest and icons
RUN node scripts/post-build.js

# Remove build tools and Node to slim image (keep nodejs for post-build script)
RUN apk del python3 make g++

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Change ownership of the app directory
RUN chown -R nextjs:nodejs /app
USER nextjs

# Serve the static site (Render injects PORT at runtime)

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# Expose port (Render will inject PORT at runtime)
EXPOSE 3000

CMD ["bun", "run", "serve:dist"]


