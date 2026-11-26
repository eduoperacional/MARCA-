import { Pool, type PoolClient, type PoolConfig } from "pg"

/**
 * Falhas que acontecem antes de a conexão ficar pronta (handshake TCP/TLS/startup do Postgres).
 * Nesse ponto nenhuma query foi enviada, então tentar de novo é seguro e idempotente.
 * Timeouts de espera na fila do pool ("timeout exceeded when trying to connect") ficam de fora
 * de propósito: repetir sob saturação só aumentaria a carga.
 */
const TRANSIENT_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "EAI_AGAIN"])
const TRANSIENT_MESSAGES = [
  /Connection terminated unexpectedly/i,
  /Client network socket disconnected before secure TLS connection was established/i,
  /Connection terminated due to connection timeout/i,
  // Enviado pelo proxy do Neon (AuthError::UserTimeout) quando o startup/SCRAM não termina a tempo.
  // Ocorre antes de qualquer query, então repetir é seguro. Falha de senha (28P01) continua sem retry.
  /^Authentication timed out$/i,
]

export function isTransientConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = (error as { code?: unknown }).code
  if (typeof code === "string" && TRANSIENT_CODES.has(code)) return true
  return TRANSIENT_MESSAGES.some((pattern) => pattern.test(error.message))
}

export type ConnectRetryOptions = {
  retries?: number
  baseDelayMs?: number
  sleep?: (ms: number) => Promise<void>
  onRetry?: (error: unknown, attempt: number) => void
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function connectWithRetry<T>(
  connectOnce: () => Promise<T>,
  { retries = 2, baseDelayMs = 150, sleep = defaultSleep, onRetry }: ConnectRetryOptions = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await connectOnce()
    } catch (error) {
      if (attempt >= retries || !isTransientConnectionError(error)) throw error
      onRetry?.(error, attempt + 1)
      await sleep(baseDelayMs * 2 ** attempt)
    }
  }
}

type ConnectCallback = (error: Error | undefined, client: PoolClient | undefined, done: (release?: unknown) => void) => void

/**
 * Envolve `pool.connect` para que Better Auth (Kysely → `pool.connect()`), Drizzle e `pool.query`
 * (que chama `this.connect(cb)` internamente) se recuperem de quedas pontuais no estabelecimento da conexão.
 */
export function installConnectRetry(pool: Pool, options: ConnectRetryOptions = {}): Pool {
  const connectOnce = Pool.prototype.connect.bind(pool) as () => Promise<PoolClient>
  const retrying = (callback?: ConnectCallback) => {
    const attempt = connectWithRetry(connectOnce, options)
    if (!callback) return attempt
    attempt.then(
      (client) => callback(undefined, client, (release) => client.release(release as boolean | Error | undefined)),
      (error: Error) => callback(error, undefined, () => {}),
    )
    return undefined
  }
  pool.connect = retrying as Pool["connect"]
  return pool
}

export const POOL_DEFAULTS = {
  max: 5,
  // Fecha conexões ociosas antes que o Neon/proxy ou a suspensão da função as derrubem silenciosamente.
  idleTimeoutMillis: 5_000,
  // Sem isso, um handshake travado espera indefinidamente.
  connectionTimeoutMillis: 8_000,
} satisfies PoolConfig

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const code = (error as { code?: unknown }).code
  return typeof code === "string" ? `${code}: ${error.message}` : error.message
}

export function createPool(config: PoolConfig, retry: ConnectRetryOptions = {}): Pool {
  const pool = new Pool({ ...POOL_DEFAULTS, ...config })
  // Sem listener, um erro em cliente ocioso vira exceção não tratada e derruba a instância.
  pool.on("error", (error) => {
    console.error(`[db] conexão ociosa encerrada pelo servidor (${describe(error)}); o pool vai abrir outra quando necessário.`)
  })
  return installConnectRetry(pool, {
    onRetry: (error, attempt) => {
      console.warn(`[db] falha transitória ao conectar (${describe(error)}); nova tentativa ${attempt}.`)
    },
    ...retry,
  })
}
