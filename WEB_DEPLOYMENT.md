# Web App Deployment Guide - Render

This guide ensures the web app functions identically to the Android app and can be deployed on Render.

## ✅ Web App Feature Parity

The web app has **full feature parity** with the Android app:

### Signal Monitoring
- ✅ JavaScript-based polling (every 10 seconds)
- ✅ Works when browser tab is active
- ✅ Same signal filtering (30-second age limit)
- ✅ Signal deduplication (prevents duplicate processing)
- ✅ Trade cooldown (35-second pause after trades)
- ✅ Uses `databaseSignalsPollingService` (same as Android)

### MT5 Trading
- ✅ Full MT5 WebView integration
- ✅ Automatic authentication
- ✅ Symbol search and chart opening
- ✅ Order dialog automation
- ✅ Multiple trade execution (configurable number of trades)
- ✅ Strict sequential execution (login → search → chart → dialog → fill → execute)
- ✅ Exact trade count matching (if config says 5, executes exactly 5)

### EA Management
- ✅ License authentication
- ✅ EA configuration
- ✅ Symbol activation/deactivation
- ✅ Trade configuration per symbol (volume, SL, TP, number of trades)

### Account Management
- ✅ MT4/MT5 account connection
- ✅ Account removal
- ✅ Broker selection

## Differences from Android

### Background Monitoring
- **Android**: Native foreground service (works even when app is minimized)
- **Web**: JavaScript polling (works when browser tab is active)
- **Note**: Browser may throttle background tabs after inactivity
- **Recommendation**: Keep browser tab active for best results

### Notifications
- **Android**: Native Android notifications
- **Web**: Browser notifications API (requires user permission)

### PWA Support
- Web app can be installed as PWA
- Works offline for cached resources
- Full-screen experience when installed

## Render Deployment

### Prerequisites
1. GitHub repository with code
2. Render account (free tier works)
3. MySQL database (can use Render's MySQL service or external)

### Step 1: Configure render.yaml

The `render.yaml` file is already configured with:
- Docker environment
- Health check endpoint (`/health`)
- Start command (`bun run serve:dist`)
- Environment variables

### Step 2: Set Environment Variables in Render

Go to Render dashboard → Your Web Service → Environment:

**Required:**
```
NODE_ENV=production
EXPO_NO_TELEMETRY=1
PORT=3000
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
```

### Step 3: Deploy

1. **Push to GitHub**: Ensure code is in GitHub repository
2. **Connect to Render**:
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Render will auto-detect `render.yaml`
3. **Deploy**: Render will automatically:
   - Build Docker image
   - Run `expo export --platform web`
   - Run post-build script
   - Start Bun server

### Step 4: Verify Deployment

1. **Health Check**: `https://your-app.onrender.com/health`
   - Should return: `{"ok":true}`

2. **Test API Endpoints**:
   ```bash
   # Get EA from license
   curl "https://your-app.onrender.com/api/get-ea-from-license?licenseKey=YOUR_KEY"
   
   # Get signals
   curl "https://your-app.onrender.com/api/get-new-signals?eaId=2&since=2025-12-06T00:00:00Z"
   ```

3. **Test Web App**:
   - Visit `https://your-app.onrender.com`
   - Login with license
   - Activate bot
   - Check browser console for polling logs

## API Endpoints

The server exposes these endpoints:

### Health Check
- `GET /health` - Returns `{"ok":true}`

### Database APIs
- `GET /api/get-ea-from-license?licenseKey=XXX` - Get EA ID from license
  - Returns: `{"id": eaId}` or `{"id": null}` if not found
- `GET /api/get-new-signals?eaId=X&since=ISO_DATE` - Get new signals
  - Returns: `{"signals": [...]}`

### Other APIs
- `POST /api/auth-license` - Authenticate license
- `POST /api/check-email` - Check email availability
- `GET /api/symbols` - Get symbols

## Testing Web App Locally

```bash
# Build web export
bun run build:web

# Serve locally
bun run serve:dist

# Test in browser
# Open http://localhost:3000
# Check browser console for logs
```

## Troubleshooting

### Build Fails
- Check Dockerfile syntax
- Verify all dependencies in `package.json`
- Check Render build logs

### Database Connection Issues
- Verify database credentials
- Check database allows connections from Render IPs
- Ensure database is accessible (not localhost-only)

### Signal Monitoring Not Working
1. Check browser console for polling logs:
   ```
   Checking for new database signals for license: XXX
   Fetching EA from license, URL: ...
   Found EA for license: 2
   Fetching new signals, URL: ...
   Found X new signals for EA 2
   ```

2. Verify:
   - Bot is activated
   - Database connection is working
   - EA has active signals
   - Browser tab is active (not throttled)

### MT5 Trading Not Working
1. Check browser console for WebView messages
2. Verify MT5 account is connected
3. Check WebView is loading MT5 terminal
4. Verify signal is recent (< 30 seconds old)

## Monitoring

### Render Dashboard
- Check build/deploy logs
- Monitor application logs
- Check service health status

### Application Logs
- Browser console (client-side)
- Render logs (server-side)
- Database connection pool status

### Health Endpoint
- `GET /health` - Should return `{"ok":true}`
- Monitor this endpoint for uptime

## Performance Optimization

### Database Connection Pooling
- Default: 20 connections
- Configurable via `DB_CONNECTION_LIMIT`
- Optimized for CPU efficiency

### Static File Caching
- HTML: No cache (always fresh)
- Assets: 1 year cache
- API responses: No cache

### Browser Optimization
- PWA support for offline caching
- Service worker for background sync (future enhancement)

## Security

- Database credentials stored as environment variables
- No hardcoded secrets
- HTTPS enforced by Render
- CORS configured for API endpoints

## Support

For issues:
1. Check Render build/deploy logs
2. Check application logs in Render dashboard
3. Verify environment variables
4. Test database connectivity
5. Check browser console for client-side errors

## Next Steps

1. Deploy to Render using `render.yaml`
2. Set environment variables
3. Test health endpoint
4. Test signal monitoring
5. Test MT5 trading
6. Monitor logs and performance
