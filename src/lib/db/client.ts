import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * PostgreSQL connection singleton
 */
let db: ReturnType<typeof drizzle> | null = null;
let pool: Pool | null = null;

/**
 * Get or create database connection
 */
export function getDb() {
  if (!db) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    pool = new Pool({
      connectionString,
      max: 10, // Maximum number of connections
      idleTimeoutMillis: 20000, // Close idle connections after 20 seconds
      connectionTimeoutMillis: 10000, // Connection timeout in milliseconds
    });

    db = drizzle(pool, { schema });
  }

  return db;
}

/**
 * Close database connection (for cleanup)
 */
export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}
