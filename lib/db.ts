import { Pool } from 'pg';

// Create a connection pool (reused across requests)
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    // Check multiple possible environment variable names
    // Supabase/Vercel might use different names
    const connectionString = 
      process.env.POSTGRES_URL || 
      process.env.DATABASE_URL || 
      process.env.SUPABASE_DATABASE_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL_NON_POOLING;
    
    if (!connectionString) {
      const error = 'Missing database connection string. Checked: POSTGRES_URL, DATABASE_URL, SUPABASE_DATABASE_URL, POSTGRES_PRISMA_URL, POSTGRES_URL_NON_POOLING';
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
    
    pool = new Pool({
      connectionString: finalConnectionString,
      // SSL configuration - Supabase requires SSL
      // Explicitly configure SSL to accept self-signed certificates
      ssl: {
        rejectUnauthorized: false, // Accept Supabase's SSL certificate (self-signed)
      },
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
