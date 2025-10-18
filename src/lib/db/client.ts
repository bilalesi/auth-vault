import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { AuthVault } from "./schema";

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 10000,
});

const db = drizzle({ client: pool, schema: { AuthVault } });

export function makeDb() {
  if (!db || !connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  return db;
}
