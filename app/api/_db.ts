// Shared MySQL connection pool for API routes
// Use dynamic import to avoid TypeScript/node type issues in Expo linting
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MySQLModule = any;

// Prefer environment variables; support common provider aliases
const DB_HOST = process.env.DB_HOST || process.env.MYSQLHOST || process.env.MYSQL_HOST || 'localhost';
const DB_USER = process.env.DB_USER || process.env.MYSQLUSER || process.env.MYSQL_USER || '';
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || '';
const DB_PORT = Number(process.env.DB_PORT || process.env.MYSQLPORT || process.env.MYSQL_PORT || 3306);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pool: any | null = null;

export async function getPool() {
  if (!pool) {
    // @ts-ignore - dynamic import; types may not be available in Expo lint context
    const mysql: MySQLModule = await import('mysql2/promise');
    pool = mysql.createPool({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      port: DB_PORT,
      connectionLimit: 10,
      waitForConnections: true,
      queueLimit: 0,
    });
  }
  return pool;
}


