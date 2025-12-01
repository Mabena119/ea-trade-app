# Use Node.js for Expo compatibility
FROM node:20-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Set env vars
ENV NODE_ENV=production
ENV EXPO_NO_TELEMETRY=1
ENV PORT=3000

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Install Expo CLI globally
RUN npm install -g @expo/cli

# Copy source
COPY . .

# Build the web app for production
RUN npx expo export:web

# Install serve to serve the static files
RUN npm install -g serve

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Serve the web-build directory
CMD ["serve", "web-build", "-l", "3000", "-s"]
