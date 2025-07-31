import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Local overrides
if (process.env.NODE_ENV === "local") {
  dotenv.config({ path: ".env.local", override: true });
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://docker:docker@localhost:5432/rinha_de_backend_2025",
  },
  verbose: true,
  strict: true,
  casing: "snake_case",
});
