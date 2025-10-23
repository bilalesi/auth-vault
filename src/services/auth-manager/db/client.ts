import "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import { AuthVault } from "@/services/auth-manager/db/schema";

const connectionString = process.env.AUTH_MANAGER_DATABASE_URL!;

const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 10000,
});

const db = drizzle({ client: pool, schema: { AuthVault } });

export function makeDb() {
  if (!db || !connectionString) {
    throw new Error(
      "AUTH_MANAGER_DATABASE_URL environment variable is not set"
    );
  }

  return db;
}
