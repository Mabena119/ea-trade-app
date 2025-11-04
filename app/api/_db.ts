// Optimized MySQL connection pool for API routes
// Use dynamic import to avoid TypeScript/node type issues in Expo linting
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MySQLModule = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PoolConnection = any;

// Prefer environment variables; support common provider aliases
const DB_HOST = process.env.DB_HOST || process.env.MYSQLHOST || process.env.MYSQL_HOST || 'localhost';
const DB_USER = process.env.DB_USER || process.env.MYSQLUSER || process.env.MYSQL_USER || '';
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || '';
const DB_PORT = Number(process.env.DB_PORT || process.env.MYSQLPORT || process.env.MYSQL_PORT || 3306);

// Connection pool configuration optimized for scaling AND CPU efficiency
const POOL_CONFIG = {
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 20), // Increased from 10
  maxIdle: Number(process.env.DB_MAX_IDLE || 10), // Maximum idle connections
  idleTimeout: Number(process.env.DB_IDLE_TIMEOUT || 60000), // Close idle connections after 60s
  queueLimit: Number(process.env.DB_QUEUE_LIMIT || 50), // Limit queued connection requests
  enableKeepAlive: true, // Keep connections alive
  keepAliveInitialDelay: 10000, // Initial keep-alive delay
  waitForConnections: true, // Wait for available connection instead of failing
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 20000), // 20s timeout
  acquireTimeout: Number(process.env.DB_ACQUIRE_TIMEOUT || 20000), // 20s to acquire connection
  timeout: Number(process.env.DB_QUERY_TIMEOUT || 30000), // 30s query timeout

  // CPU-efficient settings
  decimalNumbers: true, // Use native decimal parsing (faster)
  bigNumberStrings: false, // Reduce memory and CPU for numbers
  supportBigNumbers: true,
  dateStrings: false, // Let MySQL parse dates (offload CPU to DB)

  // Memory and CPU optimization
  typeCast: true, // Enable type casting (more efficient)
  multipleStatements: false, // Security & prevents CPU-heavy batch queries
  rowsAsArray: false, // Objects are fine, no need for arrays
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pool: any | null = null;
let isShuttingDown = false;
let poolWarmedUp = false;

// Simple in-memory cache to reduce database CPU load
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class SimpleCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private maxSize: number = Number(process.env.DB_CACHE_MAX_SIZE || 1000);
  private defaultTTL: number = Number(process.env.DB_CACHE_TTL || 60000); // 60s default

  set<T>(key: string, data: T, ttl?: number): void {
    // Prevent cache from growing too large (CPU protection)
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      // Expired - remove and return null
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  getSize(): number {
    return this.cache.size;
  }

  // Clean expired entries (run periodically)
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }
}

const queryCache = new SimpleCache();

// Cleanup cache every 5 minutes to free memory
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const removed = queryCache.cleanup();
    if (removed > 0) {
      console.log(`🧹 Cache cleanup: removed ${removed} expired entries`);
    }
  }, 5 * 60 * 1000);
}

/**
 * Warm up connection pool to prevent CPU spikes on first requests
 * Pre-establishes connections during startup
 */
async function warmUpPool(targetPool: any): Promise<void> {
  if (poolWarmedUp) return;

  console.log('🔥 Warming up connection pool...');
  const warmupCount = Math.min(5, POOL_CONFIG.maxIdle); // Warm up 5 or maxIdle, whichever is smaller
  const connections: any[] = [];

  try {
    // Pre-establish connections
    for (let i = 0; i < warmupCount; i++) {
      const conn = await targetPool.getConnection();
      await conn.ping(); // Verify connection works
      connections.push(conn);
    }

    // Release all connections back to pool
    for (const conn of connections) {
      conn.release();
    }

    poolWarmedUp = true;
    console.log(`✅ Connection pool warmed up with ${warmupCount} connections`);
  } catch (error) {
    console.error('⚠️ Pool warmup failed (non-critical):', error);
    // Release any connections we did get
    for (const conn of connections) {
      try {
        conn.release();
      } catch (e) {
        // Ignore
      }
    }
  }
}

/**
 * Get or create the connection pool singleton
 * Implements connection pooling with optimized settings for scaling AND CPU efficiency
 */
export async function getPool() {
  if (isShuttingDown) {
    throw new Error('Database pool is shutting down');
  }

  if (!pool) {
    // @ts-ignore - dynamic import; types may not be available in Expo lint context
    const mysql: MySQLModule = await import('mysql2/promise');

    pool = mysql.createPool({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      port: DB_PORT,
      ...POOL_CONFIG,
    });

    // Monitor pool health
    if (pool) {
      // Log pool creation
      console.log('✅ Database connection pool created with config:', {
        host: DB_HOST,
        database: DB_NAME,
        connectionLimit: POOL_CONFIG.connectionLimit,
        maxIdle: POOL_CONFIG.maxIdle,
        idleTimeout: POOL_CONFIG.idleTimeout,
        queueLimit: POOL_CONFIG.queueLimit,
        cacheEnabled: true,
        cacheTTL: queryCache['defaultTTL'],
      });

      // Setup connection error handlers (reduced logging to save CPU)
      pool.on('connection', (connection: any) => {
        // Setup connection-level error handler
        connection.on('error', (err: Error) => {
          console.error('❌ Database connection error:', err.message);
        });
      });

      pool.on('enqueue', () => {
        console.warn('⏳ Connection request queued - consider increasing pool size');
      });

      // Warm up pool in background (non-blocking)
      warmUpPool(pool).catch(err => {
        console.error('Pool warmup error:', err);
      });
    }
  }

  return pool;
}

/**
 * Get connection with retry logic and exponential backoff
 * Prevents connection storms during high load
 */
export async function getConnectionWithRetry(
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<PoolConnection> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const pool = await getPool();
      const connection = await pool.getConnection();

      // Test connection is alive
      await connection.ping();

      return connection;
    } catch (error) {
      lastError = error as Error;
      console.error(`❌ Connection attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = initialDelay * Math.pow(2, attempt - 1);
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed to get connection after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Execute query with automatic connection management
 * Ensures connections are always released back to pool
 */
export async function executeQuery<T = any>(
  query: string,
  params: any[] = []
): Promise<T[]> {
  let connection: PoolConnection | null = null;

  try {
    connection = await getConnectionWithRetry();
    const [rows] = await connection.execute(query, params);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error('❌ Query execution failed:', error);
    throw error;
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch (releaseError) {
        console.error('❌ Failed to release connection:', releaseError);
      }
    }
  }
}

/**
 * Execute query with caching support to reduce database CPU load
 * Use for read-only queries that can be cached
 * 
 * @param query - SQL query string
 * @param params - Query parameters
 * @param options - Cache options (ttl, bypassCache)
 */
export async function executeCachedQuery<T = any>(
  query: string,
  params: any[] = [],
  options: {
    ttl?: number;        // Cache time-to-live in ms (default: 60000)
    bypassCache?: boolean; // Skip cache and force fresh query
    cacheKey?: string;   // Custom cache key (auto-generated if not provided)
  } = {}
): Promise<T[]> {
  // Generate cache key from query + params
  const cacheKey = options.cacheKey || `query:${query}:${JSON.stringify(params)}`;

  // Check cache first (unless bypassed)
  if (!options.bypassCache) {
    const cached = queryCache.get<T[]>(cacheKey);
    if (cached !== null) {
      console.log('💾 Cache hit for query');
      return cached;
    }
  }

  // Cache miss - execute query
  console.log('🔍 Cache miss - executing query');
  const results = await executeQuery<T>(query, params);

  // Store in cache
  queryCache.set(cacheKey, results, options.ttl);

  return results;
}

/**
 * Invalidate cache entries matching a pattern
 * Useful when data is updated
 */
export function invalidateCache(pattern?: string): void {
  if (!pattern) {
    queryCache.clear();
    console.log('🗑️ Cache cleared completely');
  } else {
    // For now, just clear all (can be enhanced to support patterns)
    queryCache.clear();
    console.log(`🗑️ Cache cleared for pattern: ${pattern}`);
  }
}

/**
 * Get pool statistics for monitoring (including CPU-relevant metrics)
 */
export function getPoolStats() {
  if (!pool) {
    return {
      pool: {
        active: 0,
        idle: 0,
        total: 0,
        waitQueue: 0,
      },
      cache: {
        size: 0,
        maxSize: 0,
        hitRate: 0,
      },
      warmedUp: poolWarmedUp,
    };
  }

  return {
    pool: {
      active: pool._allConnections?.length - pool._freeConnections?.length || 0,
      idle: pool._freeConnections?.length || 0,
      total: pool._allConnections?.length || 0,
      waitQueue: pool._connectionQueue?.length || 0,
    },
    cache: {
      size: queryCache.getSize(),
      maxSize: queryCache['maxSize'],
      ttl: queryCache['defaultTTL'],
    },
    warmedUp: poolWarmedUp,
  };
}

/**
 * Gracefully shutdown the connection pool
 * Should be called when server is shutting down
 */
export async function shutdownPool(): Promise<void> {
  if (pool && !isShuttingDown) {
    isShuttingDown = true;
    console.log('🔄 Shutting down database connection pool...');

    try {
      await pool.end();
      pool = null;
      console.log('✅ Database connection pool closed gracefully');
    } catch (error) {
      console.error('❌ Error closing database pool:', error);
      throw error;
    } finally {
      isShuttingDown = false;
    }
  }
}

// Graceful shutdown on process termination
if (typeof process !== 'undefined') {
  process.on('SIGTERM', async () => {
    console.log('📡 SIGTERM received, closing database pool...');
    await shutdownPool();
  });

  process.on('SIGINT', async () => {
    console.log('📡 SIGINT received, closing database pool...');
    await shutdownPool();
  });
}


