/**
 * Database Status Check Script
 *
 * Checks database connection and displays table information
 */
import dotenv from "dotenv";
import path from "path";

// Explicitly load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { makeDb } from "../src/lib/db/client";
import { sql } from "drizzle-orm";

async function checkDatabase() {
  console.log("🔍 Checking database status...\n");

  const db = makeDb();

  try {
    // Test connection
    console.log("📡 Testing database connection...");
    await db.execute(sql`SELECT 1`);
    console.log("✅ Database connection successful!\n");

    // Check if token_vault table exists
    console.log("📊 Checking tables...");
    const tables = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    if (tables.rows.length === 0) {
      console.log("⚠️  No tables found in database");
      console.log("\nNext steps:");
      console.log("1. Run: npm run db:generate");
      console.log("2. Run: npm run db:migrate");
    } else {
      console.log(`✅ Found ${tables.rows.length} table(s):\n`);
      tables.rows.forEach((row: any) => {
        console.log(`   - ${row.table_name}`);
      });
    }

    // Check token_vault table structure
    const tokenVaultExists = tables.rows.some(
      (row: any) => row.table_name === "token_vault"
    );

    if (tokenVaultExists) {
      console.log("\n📋 Token Vault table structure:");
      const columns = await db.execute(sql`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'token_vault'
        ORDER BY ordinal_position
      `);

      columns.rows.forEach((col: any) => {
        const nullable = col.is_nullable === "YES" ? "NULL" : "NOT NULL";
        const defaultVal = col.column_default
          ? ` DEFAULT ${col.column_default}`
          : "";
        console.log(
          `   - ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`
        );
      });

      // Count tokens
      const count = await db.execute(
        sql`SELECT COUNT(*) as count FROM token_vault`
      );
      console.log(`\n📊 Total tokens in vault: ${count.rows[0].count}`);

      // Show token statistics
      const stats = await db.execute(sql`
        SELECT 
          token_type,
          status,
          COUNT(*) as count
        FROM token_vault
        GROUP BY token_type, status
        ORDER BY token_type, status
      `);

      if (stats.rows.length > 0) {
        console.log("\n📈 Token statistics:");
        stats.rows.forEach((stat: any) => {
          console.log(
            `   - ${stat.token_type} (${stat.status || "N/A"}): ${stat.count}`
          );
        });
      }
    }

    console.log("\n✅ Database check complete!");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error checking database:", error);
    console.log("\nTroubleshooting:");
    console.log("1. Check if PostgreSQL is running");
    console.log("2. Verify DATABASE_URL in .env.local");
    console.log("3. Ensure database exists");
    process.exit(1);
  }
}

checkDatabase();
