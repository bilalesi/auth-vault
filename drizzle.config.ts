import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/services/auth-manager/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.AUTH_MANAGER_DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
