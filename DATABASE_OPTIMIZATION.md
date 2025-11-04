# Database Connection Optimization Guide

## Overview

This application has been optimized to handle database connections efficiently at scale. The optimizations prevent connection errors and disruptions that occur when the app scales up.

## Key Improvements

### 1. **Connection Pooling**
- Increased connection pool size from 10 to 20 connections (configurable)
- Added connection reuse to minimize overhead
- Implemented idle connection management

### 2. **Connection Pool Configuration**

The following environment variables can be configured:

```bash
# Core Database Settings
DB_HOST=your_host
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=your_database
DB_PORT=3306

# Pool Configuration (with recommended defaults)
DB_CONNECTION_LIMIT=20        # Max concurrent connections
DB_MAX_IDLE=10               # Max idle connections to keep alive
DB_IDLE_TIMEOUT=60000        # Close idle connections after 60s
DB_QUEUE_LIMIT=50            # Max queued connection requests
DB_CONNECT_TIMEOUT=20000     # Connection establishment timeout
DB_ACQUIRE_TIMEOUT=20000     # Pool connection acquire timeout
DB_QUERY_TIMEOUT=30000       # Query execution timeout
```

### 3. **Retry Logic with Exponential Backoff**

All database operations now include:
- Automatic retry on connection failure (up to 3 attempts)
- Exponential backoff (1s, 2s, 4s) between retries
- Prevents connection storms during high load

### 4. **Guaranteed Connection Release**

All API routes now use a robust pattern:
```typescript
let conn = null;
try {
  conn = await pool.getConnection();
  // ... perform queries
} finally {
  if (conn) conn.release();
}
```

This ensures connections are **always** returned to the pool, even if errors occur.

### 5. **Connection Health Monitoring**

#### Health Check Endpoint
```bash
GET /api/health
```

Returns pool statistics:
```json
{
  "status": "healthy",
  "database": "connected",
  "pool": {
    "activeConnections": 5,
    "idleConnections": 15,
    "totalConnections": 20,
    "waitQueue": 0
  },
  "timestamp": "2025-11-04T12:00:00.000Z"
}
```

#### Pool Event Logging
The system logs important pool events:
- 🔌 New connections established
- 📥 Connections acquired from pool
- 📤 Connections released back to pool
- ⏳ Connection requests queued
- ❌ Connection errors

### 6. **Graceful Shutdown**

The pool automatically closes all connections on:
- SIGTERM signal (production deployments)
- SIGINT signal (Ctrl+C in development)

This prevents orphaned connections when the server restarts or scales down.

## Best Practices

### For Development
1. Monitor the console logs for pool activity
2. Use `/api/health` endpoint to check pool status
3. Keep connection limits reasonable to avoid overwhelming your database

### For Production
1. Configure environment variables based on your database server capacity
2. Monitor the health endpoint regularly
3. Set up alerts for connection pool exhaustion
4. Scale horizontally if you need more than 20 connections per instance

### Scaling Recommendations

| User Load | Recommended Settings |
|-----------|---------------------|
| < 100 concurrent users | `DB_CONNECTION_LIMIT=10` |
| 100-500 concurrent users | `DB_CONNECTION_LIMIT=20` |
| 500-1000 concurrent users | `DB_CONNECTION_LIMIT=30` |
| > 1000 concurrent users | Multiple app instances + load balancer |

## Troubleshooting

### Issue: "Too many connections" error
**Solution:** 
- Increase `max_connections` on your MySQL server
- Add more app instances instead of increasing pool size
- Check for connection leaks (all connections should be released)

### Issue: Slow response times
**Solution:**
- Check `waitQueue` in health endpoint - if > 0, you need more connections
- Increase `DB_CONNECTION_LIMIT`
- Optimize slow queries

### Issue: Connection timeouts
**Solution:**
- Increase `DB_CONNECT_TIMEOUT` and `DB_ACQUIRE_TIMEOUT`
- Check network latency to database
- Verify database server is not overloaded

## Updated Files

The following files were optimized:

1. **`app/api/_db.ts`** - Core connection pool implementation
   - Added connection pooling with configurable limits
   - Implemented retry logic with exponential backoff
   - Added health monitoring and graceful shutdown

2. **`app/api/auth-license/route.ts`** - License authentication endpoint
   - Improved connection handling with try-finally
   - Guaranteed connection release

3. **`app/api/symbols/route.ts`** - Symbols retrieval endpoint
   - Improved connection handling with try-finally
   - Guaranteed connection release

4. **`app/api/check-email/route.ts`** - Email verification endpoint
   - Improved connection handling with try-finally
   - Guaranteed connection release

5. **`app/api/health/route.ts`** - New health monitoring endpoint
   - Real-time pool statistics
   - Database connectivity check

## Migration Notes

No breaking changes were introduced. All existing API contracts remain the same.

The optimizations are backward compatible and will work with existing client code.

## Monitoring Checklist

- [ ] Set up `/api/health` monitoring
- [ ] Configure appropriate connection pool limits for your load
- [ ] Monitor database server `max_connections` setting
- [ ] Set up alerts for pool exhaustion
- [ ] Review logs for connection errors
- [ ] Load test to verify improvements

## Additional Resources

- [MySQL Connection Pool Documentation](https://github.com/sidorares/node-mysql2#using-connection-pools)
- [Connection Pool Best Practices](https://github.com/sidorares/node-mysql2#connection-pool-options)

