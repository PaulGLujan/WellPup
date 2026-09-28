import { drizzle } from "drizzle-orm/neon-http"

import * as schema from "./schema"

if (!process.env.DATABASE_URL_POOLED) {
  throw new Error("DATABASE_URL_POOLED is not set")
}

// Runtime queries go through the pooled connection.
export const db = drizzle(process.env.DATABASE_URL_POOLED, { schema })
