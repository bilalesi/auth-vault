/**
 * Database Reset Script
 *
 * Drops all tables and resets the database
 * WARNING: This will delete all data!
 */
import dotenv from "dotenv";
import path from "path";

import { makeDb } from "../src/lib/db/client";
import { sql } from "drizzle-orm";
import * as readline from "readline";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function reset() {
  console.log("⚠️  WARNING: This will delete ALL data from the database!");
  console.log("⚠️  This action cannot be undone!");

  // Create readline interface for user confirmation
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question("\nAre you sure you want to continue? (yes/no): ", resolve);
  });

  rl.close();

  if (answer.toLowerCase() !== "yes") {
    console.log("❌ Reset cancelled");
    process.exit(0);
  }

  console.log("\n🗑️  Resetting database...");

  const db = makeDb();

  try {
    // Drop all tables
    await db.execute(sql`DROP TABLE IF EXISTS auth_vault CASCADE`);

    console.log("✅ Database reset successfully!");
    console.log("\nNext steps:");
    console.log("1. Run: npm run db:generate");
    console.log("2. Run: npm run db:migrate");
    console.log("3. Run: npm run db:seed (optional)");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error resetting database:", error);
    process.exit(1);
  }
}

reset();
