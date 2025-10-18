/**
 * Database Seeding Script
 *
 * Seeds the database with sample data for testing
 */

import { makeDb } from "../src/lib/db/client";

async function seed() {
  console.log("🌱 Seeding database...");

  const db = makeDb();

  try {
    // Example: Seed some test tokens (optional)
    console.log("✅ Database seeded successfully!");
    console.log("\nNote: Token vault is empty by design.");
    console.log("Tokens will be created through the authentication flow.");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

seed();
