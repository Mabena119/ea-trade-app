# Deployment Guide - EA Trade App

This guide covers deploying the EA Trade app to Render as a web service.

## Prerequisites

- GitHub repository with the code
- Render account (free tier works)
- MySQL database (can use Render's MySQL service or external)

## Render Deployment Setup

### 1. Connect GitHub Repository

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Select the repository containing this code

### 2. Configure Web Service

Use the following settings:

- **Name**: `ea-trade-web`
- **Environment**: `Docker`
- **Region**: Choose closest to your users
- **Branch**: `main` (or your default branch)
- **Root Directory**: `.` (root of repository)
- **Dockerfile Path**: `./Dockerfile`
- **Docker Context**: `.`
- **Health Check Path**: `/health`
- **Start Command**: `bun run serve:dist`

### 3. Environment Variables

Add these environment variables in Render dashboard:

**Required:**
```
NODE_ENV=production
EXPO_NO_TELEMETRY=1
PORT=3000
```

**Database Configuration:**
```
DB_HOST=your-database-host
DB_USER=your-database-user
DB_PASSWORD=your-database-password
DB_NAME=your-database-name
DB_PORT=3306
```

**Optional (for optimization):**
```
DB_CONNECTION_LIMIT=20
DB_MAX_IDLE=10
DB_IDLE_TIMEOUT=60000
DB_QUEUE_LIMIT=50
DB_CONNECT_TIMEOUT=20000
DB_ACQUIRE_TIMEOUT=20000
DB_QUERY_TIMEOUT=30000
```

### 4. Deploy

1. Click "Create Web Service"
2. Render will automatically:
   - Build the Docker image
   - Run `expo export --platform web`
   - Run post-build script
   - Start the Bun server
3. Wait for deployment to complete (usually 5-10 minutes)

### 5. Verify Deployment

1. Check health endpoint: `https://your-app.onrender.com/health`
2. Should return: `{"ok":true}`
3. Visit the app URL to test functionality

## Web App Features

The web app includes all Android app features:

✅ **Signal Monitoring**
- JavaScript-based polling (every 10 seconds)
- Works when browser tab is active
- Uses `databaseSignalsPollingService` for signal detection

✅ **MT5 Trading**
- Full MT5 WebView integration
- Automatic authentication
- Symbol search and chart opening
- Order dialog automation
- Multiple trade execution (configurable)

✅ **EA Management**
- License authentication
- EA configuration
- Symbol activation/deactivation
- Trade configuration per symbol

✅ **Account Management**
- MT4/MT5 account connection
- Account removal
- Broker selection

## Differences from Android

**Background Monitoring:**
- Web app uses JavaScript polling (works when tab is active)
- No native foreground service (not available in browsers)
- Browser may throttle background tabs after inactivity
- For best results, keep the browser tab active

**Notifications:**
- Uses browser notifications API
- Requires user permission
- Works when tab is active

**PWA Support:**
- App can be installed as PWA
- Works offline for cached resources
- Full-screen experience when installed

## Troubleshooting

### Build Fails

1. Check Dockerfile syntax
2. Verify all dependencies in `package.json`
3. Check Render build logs for specific errors

### Database Connection Issues

1. Verify database credentials
2. Check database allows connections from Render IPs
3. Ensure database is accessible (not localhost-only)

### App Not Loading

1. Check `/health` endpoint works
2. Verify static files are being served
3. Check browser console for errors
4. Verify API routes are working (`/api/get-ea-from-license`)

### Signal Monitoring Not Working

1. Ensure bot is activated
2. Check browser console for polling logs
3. Verify database connection is working
4. Check that EA has active signals

## Manual Deployment

If you prefer to deploy manually:

```bash
# Build web export
bun run build:web

# Test locally
bun run serve:dist

# Deploy to Render (via Git push)
git add .
git commit -m "Deploy web app"
git push origin main
```

## Updating Deployment

Render automatically redeploys on:
- Git push to connected branch
- Manual redeploy from dashboard
- Environment variable changes

## Monitoring

- Check Render dashboard for logs
- Monitor `/health` endpoint
- Check database connection pool status
- Monitor API response times

## Support

For issues:
1. Check Render build/deploy logs
2. Check application logs in Render dashboard
3. Verify environment variables
4. Test database connectivity
5. Check browser console for client-side errors
