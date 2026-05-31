import { Pool, PoolConfig } from 'pg'

// Parse connection string and configure SSL properly
function getPoolConfig(): PoolConfig {
  const connStr = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || ''
  
  // Parse connection string to extract components
  const url = new URL(connStr.replace('postgres://', 'postgresql://'))
  
  return {
    user: url.username,
    password: decodeURIComponent(url.password),
    host: url.hostname,
    port: parseInt(url.port) || 5432,
    database: url.pathname.slice(1),
    ssl: {
      // Disable SSL certificate verification for Supabase pooler connections
      rejectUnauthorized: false,
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  }
}

// Create a connection pool for direct Postgres access
// This is used for public APIs that don't need Supabase auth
let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    pool = new Pool(getPoolConfig())
  }
  return pool
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await getPool().connect()
  try {
    const result = await client.query(text, params)
    return result.rows as T[]
  } finally {
    client.release()
  }
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] || null
}

export { getPool as pool }
