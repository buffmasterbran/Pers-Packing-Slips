import { Pool } from 'pg';

// Create a connection pool (reused across requests)
let pool: Pool | null = null;

function buildDatabaseUrlFromParts(): string | null {
  const host = process.env.POSTGRES_HOST;
  const port = process.env.POSTGRES_PORT || '5432';
  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  const database = process.env.POSTGRES_DB;

  if (!host || !user || !password || !database) {
    return null;
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function resolveSslConfig(connectionString: string) {
  const sslMode = process.env.DB_SSL_MODE?.toLowerCase();

  // Explicit override via env var:
  // - disable: no SSL
  // - require: SSL with cert validation
  // - no-verify: SSL without cert validation
  if (sslMode === 'disable') return undefined;
  if (sslMode === 'require') return { rejectUnauthorized: true };
  if (sslMode === 'no-verify') return { rejectUnauthorized: false };

  // Backward compatibility: preserve SSL behavior when URL requests SSL.
  if (connectionString.includes('sslmode=require') || connectionString.includes('ssl=true')) {
    return { rejectUnauthorized: false };
  }

  // Default for private/internal database networks (e.g., Coolify service network)
  return undefined;
}

function getPool(): Pool {
  if (!pool) {
    // Check multiple possible environment variable names
    const connectionString = 
      process.env.DATABASE_URL || 
      process.env.POSTGRES_URL || 
      process.env.SUPABASE_DATABASE_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      buildDatabaseUrlFromParts();
    
    if (!connectionString) {
      const error = 'Missing database connection. Checked: DATABASE_URL, POSTGRES_URL, SUPABASE_DATABASE_URL, POSTGRES_PRISMA_URL, POSTGRES_URL_NON_POOLING, or POSTGRES_HOST/PORT/USER/PASSWORD/DB.';
      console.error(error);
      throw new Error(error);
    }
    
    console.log('Connecting to database with connection string:', connectionString.replace(/:[^:@]+@/, ':****@')); // Hide password in logs
    
    // Prefer non-pooling URL for direct connections (more reliable SSL)
    const useNonPooling = process.env.POSTGRES_URL_NON_POOLING && 
                          !connectionString.includes('pooler');
    const baseConnectionString = useNonPooling 
      ? (process.env.POSTGRES_URL_NON_POOLING || connectionString)
      : connectionString;
    
    // Remove sslmode from connection string and handle SSL via Pool config
    // This prevents conflicts with SSL certificate handling
    const url = new URL(baseConnectionString);
    url.searchParams.delete('sslmode');
    const finalConnectionString = url.toString();
    const ssl = resolveSslConfig(baseConnectionString);
    
    pool = new Pool({
      connectionString: finalConnectionString,
      ssl,
      // Connection pool settings for serverless
      max: 1, // Limit connections for serverless
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  
  return pool;
}

/**
 * Initialize database - create table if it doesn't exist
 * This is safe to call multiple times
 */
async function ensureTableExists() {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS printed_orders (
        tranid TEXT PRIMARY KEY,
        printed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
  } catch (error) {
    // Table might already exist, which is fine
    console.error('Error ensuring table exists:', error);
  } finally {
    client.release();
  }
}

/**
 * Get all printed order tranids
 */
export async function getPrintedOrders(): Promise<string[]> {
  await ensureTableExists();
  const client = await getPool().connect();
  try {
    const result = await client.query('SELECT tranid FROM printed_orders ORDER BY printed_at DESC');
    return result.rows.map(row => row.tranid as string);
  } catch (error) {
    console.error('Error getting printed orders:', error);
    return [];
  } finally {
    client.release();
  }
}

/**
 * Check if a specific order is printed
 */
export async function isOrderPrinted(tranid: string): Promise<boolean> {
  await ensureTableExists();
  const client = await getPool().connect();
  try {
    const result = await client.query('SELECT tranid FROM printed_orders WHERE tranid = $1', [tranid]);
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking if order is printed:', error);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Mark orders as printed
 */
export async function markOrdersAsPrinted(tranids: string[]): Promise<void> {
  if (tranids.length === 0) return;
  
  await ensureTableExists();
  const client = await getPool().connect();
  try {
    // Insert each tranid, ignoring duplicates
    for (const tranid of tranids) {
      await client.query(
        'INSERT INTO printed_orders (tranid) VALUES ($1) ON CONFLICT (tranid) DO NOTHING',
        [tranid]
      );
    }
  } catch (error) {
    console.error('Error marking orders as printed:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Clear all printed orders
 */
export async function clearPrintedOrders(): Promise<void> {
  await ensureTableExists();
  const client = await getPool().connect();
  try {
    await client.query('DELETE FROM printed_orders');
  } catch (error) {
    console.error('Error clearing printed orders:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Remove specific orders from printed list
 */
export async function unmarkOrdersAsPrinted(tranids: string[]): Promise<void> {
  if (tranids.length === 0) return;
  
  await ensureTableExists();
  const client = await getPool().connect();
  try {
    // Delete multiple tranids - delete one by one (simple and reliable)
    for (const tranid of tranids) {
      await client.query('DELETE FROM printed_orders WHERE tranid = $1', [tranid]);
    }
  } catch (error) {
    console.error('Error unmarking orders as printed:', error);
    throw error;
  } finally {
    client.release();
  }
}
