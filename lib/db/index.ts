import "server-only"

import { PGlite } from "@electric-sql/pglite"
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { drizzle as drizzleLite } from "drizzle-orm/pglite"
import { Pool } from "pg"

import { DEMO_DDL } from "./demo-schema"
import { seedDemo } from "./demo-seed"
import * as schema from "./schema"

/** Sem DATABASE_URL a MARCAÍ roda com um banco local em memória populado com dados de demonstração. */
export const isDemoMode = !process.env.DATABASE_URL

type Db = NodePgDatabase<typeof schema>

const globalForDb = globalThis as unknown as { pool?: Pool; lite?: PGlite; liteReady?: Promise<void> }

function createDemoClient() {
  const lite = globalForDb.lite ?? new PGlite()
  globalForDb.lite = lite
  globalForDb.liteReady ??= (async () => {
    await lite.exec(DEMO_DDL)
    const { rows } = await lite.query<{ count: number }>("select count(*)::int as count from businesses")
    if (!rows[0]?.count) await seedDemo(lite)
  })()
  const ready = globalForDb.liteReady

  // Garante que nenhuma consulta rode antes de o schema e os dados de demonstração existirem.
  return new Proxy(lite, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (prop === "query" || prop === "exec" || prop === "transaction") {
        return async (...args: unknown[]) => {
          await ready
          return (value as (...a: unknown[]) => unknown).apply(target, args)
        }
      }
      return typeof value === "function" ? value.bind(target) : value
    },
  })
}

function createDb(): Db {
  if (isDemoMode) return drizzleLite(createDemoClient(), { schema }) as unknown as Db
  const pool = globalForDb.pool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  if (process.env.NODE_ENV !== "production") globalForDb.pool = pool
  return drizzlePg(pool, { schema })
}

export const db = createDb()
