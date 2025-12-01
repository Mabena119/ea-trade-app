# Render Deployment Guide - React Web Build

## Overview
This app is configured to deploy as a React web application on Render using Docker.

## Build Process

### 1. Production Build
- **Build Command**: `NODE_ENV=production expo export --platform web`
- **Output**: Static React web app in `dist/` directory
- **Post-Build**: Runs `scripts/post-build.js` to:
  - Add responsive viewport meta tags
  - Inject React Native Web event system initialization
  - Configure PWA manifest and icons

### 2. Docker Build
- **Base Image**: `oven/bun:1.2.20-alpine`
- **Build Steps**:
  1. Install dependencies (including devDependencies for build)
  2. Export Expo web build with `NODE_ENV=production`
  3. Run post-build script
  4. Remove build tools
  5. Create non-root user
  6. Serve static files with Bun

### 3. Server Configuration
- **Server**: Bun HTTP server (`server.ts`)
- **Port**: Set via `PORT` environment variable (default: 3000)
- **Static Files**: Served from `dist/` directory
- **API Routes**: Handled via `/api/*` endpoints

## Render Configuration

### render.yaml
```yaml
services:
  - type: web
    name: ea-trade-web
    env: docker
    plan: free
    autoDeploy: true
    healthCheckPath: /
    envVars:
      - key: EXPO_NO_TELEMETRY
        value: "1"
      - key: NODE_ENV
        value: "production"
      - key: PORT
        value: "3000"
```

### Environment Variables
- `EXPO_NO_TELEMETRY=1`: Disables Expo telemetry
- `NODE_ENV=production`: Enables production optimizations
- `PORT=3000`: Server port (Render injects this automatically)

## Deployment Steps

1. **Push to GitHub**: Changes are automatically detected
2. **Render Builds**: Docker image is built using `Dockerfile`
3. **Static Export**: Expo creates optimized React web build
4. **Post-Build**: Scripts configure event system and PWA
5. **Server Starts**: Bun serves the static React app

## Features

### React Native Web Event System
- Event delegation initialized before React loads
- Multiple initialization attempts ensure events work
- MutationObserver watches for React mounting
- Proper pointer-events and touch-action configuration

### Responsive Design
- Viewport meta tag configured for mobile
- Safe area insets for iOS devices
- Horizontal scroll prevention
- Touch-friendly interactions

### PWA Support
- Manifest configured
- Icons and favicons included
- Standalone display mode
- Offline-capable (static export)

## Local Testing

```bash
# Build locally
npm run build:web

# Serve locally
PORT=3000 bun run serve:dist

# Test in browser
open http://localhost:3000
```

## Troubleshooting

### Build Issues
- Ensure `NODE_ENV=production` is set during build
- Check that all dependencies are installed
- Verify `dist/` directory is created after export

### Runtime Issues
- Check server logs in Render dashboard
- Verify `PORT` environment variable is set
- Ensure health check endpoint (`/`) responds

### Event System Issues
- Check browser console for initialization messages
- Verify `data-reactroot` attribute on `#root`
- Ensure `pointer-events: auto` on root element
# Deployment Mon Dec  1 13:36:42 SAST 2025
