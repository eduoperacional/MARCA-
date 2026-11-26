import "server-only"

import { attachDatabasePool } from "@vercel/functions"
import { drizzle } from "drizzle-orm/node-postgres"
import type { Pool } from "pg"

import { normalizeSslMode } from "./connection-string"
import { createPool } from "./pool"
import * as schema from "./schema"

const connectionString = normalizeSslMode(
  process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING,
)

if (!connectionString) {
  console.error(
    "[db] Nenhuma variável de conexão encontrada. Defina DATABASE_URL (ou POSTGRES_URL) nas Environment Variables do projeto.",
  )
}

const globalForDb = globalThis as unknown as { pool?: Pool }

export const pool = globalForDb.pool ?? createPool({ connectionString })

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool

// No Fluid compute, fecha as conexões ociosas antes de a instância ser suspensa, evitando sockets mortos ao retomar.
attachDatabasePool(pool)

export const db = drizzle(pool, { schema })
