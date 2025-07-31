import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Local overrides
if (process.env.NODE_ENV === "local") {
  dotenv.config({ path: ".env.local", override: true });
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be configured.");
}

export default defineConfig({
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  schema: "./src/db/schema/*",
  out: "./src/db/migrations",
  verbose: true,
  casing: "snake_case",
});
