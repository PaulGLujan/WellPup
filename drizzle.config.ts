import { defineConfig } from "drizzle-kit"

// drizzle-kit doesn't load .env on its own. Fall back to the ambient
// environment (e.g. CI) when there is no .env file.
try {
  process.loadEnvFile(".env")
} catch {}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set")
}

// Migrations use the direct (non-pooled) connection.
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
})
