import { getPool, getPoolStats } from '@/app/api/_db';

/**
 * Health check endpoint for monitoring database connection pool and CPU efficiency
 * GET /api/health
 */
export async function GET(request: Request): Promise<Response> {
    try {
        const pool = await getPool();
        const stats = getPoolStats();

        // Try to execute a simple query to verify connection
        const conn = await pool.getConnection();
        try {
            await conn.ping();
            conn.release();

            // Calculate CPU efficiency score (0-100)
            const cpuScore = calculateCPUScore(stats);

            return Response.json({
                status: 'healthy',
                database: 'connected',
                pool: {
                    activeConnections: stats.pool.active,
                    idleConnections: stats.pool.idle,
                    totalConnections: stats.pool.total,
                    waitQueue: stats.pool.waitQueue,
                    warmedUp: stats.warmedUp,
                },
                cache: {
                    enabled: true,
                    size: stats.cache.size,
                    maxSize: stats.cache.maxSize,
                    ttl: stats.cache.ttl,
                },
                cpu: {
                    efficiencyScore: cpuScore,
                    status: cpuScore >= 80 ? 'excellent' : cpuScore >= 60 ? 'good' : cpuScore >= 40 ? 'fair' : 'needs-optimization',
                    recommendations: getCPURecommendations(stats, cpuScore),
                },
                timestamp: new Date().toISOString(),
            }, { status: 200 });
        } catch (pingError) {
            conn.release();
            throw pingError;
        }
    } catch (error) {
        console.error('❌ Health check failed:', error);

        return Response.json({
            status: 'unhealthy',
            database: 'disconnected',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
        }, { status: 503 });
    }
}

/**
 * Calculate CPU efficiency score based on pool metrics
 */
function calculateCPUScore(stats: any): number {
    let score = 100;

    // Penalize if wait queue is building up (CPU is bottlenecked)
    if (stats.pool.waitQueue > 0) {
        score -= Math.min(40, stats.pool.waitQueue * 2);
    }

    // Penalize if all connections are active (no room for spikes)
    const utilization = stats.pool.total > 0 ? (stats.pool.active / stats.pool.total) * 100 : 0;
    if (utilization > 90) {
        score -= 20;
    } else if (utilization > 80) {
        score -= 10;
    }

    // Bonus if pool is warmed up (faster responses, less CPU spikes)
    if (!stats.warmedUp) {
        score -= 10;
    }

    // Bonus if cache is being used effectively
    if (stats.cache.size > 0) {
        score += 5;
    }

    return Math.max(0, Math.min(100, score));
}

/**
 * Get CPU optimization recommendations
 */
function getCPURecommendations(stats: any, score: number): string[] {
    const recommendations: string[] = [];

    if (stats.pool.waitQueue > 5) {
        recommendations.push('Increase DB_CONNECTION_LIMIT - requests are queuing');
    }

    if (stats.pool.total > 0 && (stats.pool.active / stats.pool.total) > 0.9) {
        recommendations.push('Consider horizontal scaling - pool utilization is very high');
    }

    if (!stats.warmedUp) {
        recommendations.push('Wait for pool warmup to complete for optimal performance');
    }

    if (stats.cache.size === 0) {
        recommendations.push('Consider using cached queries for frequently accessed data');
    }

    if (stats.cache.size >= stats.cache.maxSize * 0.9) {
        recommendations.push('Increase DB_CACHE_MAX_SIZE - cache is nearly full');
    }

    if (score >= 80) {
        recommendations.push('System is running optimally - no action needed');
    }

    return recommendations;
}

