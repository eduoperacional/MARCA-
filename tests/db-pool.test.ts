import assert from "node:assert/strict"
import net from "node:net"
import { after, describe, test } from "node:test"

import pg from "pg"

import { connectWithRetry, createPool, isTransientConnectionError, POOL_DEFAULTS } from "@/lib/db/pool"

const noWait = { sleep: async () => {} }

type FakeServer = { port: number; connections: () => number; close: () => Promise<void> }

/**
 * Servidor TCP mínimo que imita o Neon em cada cenário:
 * - "drop": fecha o socket logo após receber a mensagem de startup → "Connection terminated unexpectedly".
 * - "tls-drop": aceita o SSLRequest ('S') e fecha durante o handshake TLS → "Client network socket disconnected...".
 * - "ok": responde AuthenticationOk + ReadyForQuery, como um Postgres sem senha.
 */
function errorResponse(fields: Record<string, string>): Buffer {
  const body = Buffer.concat([
    ...Object.entries(fields).map(([type, value]) => Buffer.from(`${type}${value}\0`, "utf8")),
    Buffer.from([0]),
  ])
  const header = Buffer.alloc(5)
  header.write("E", 0)
  header.writeInt32BE(body.length + 4, 1)
  return Buffer.concat([header, body])
}

type Behaviour = "drop" | "tls-drop" | "auth-timeout" | "ok"

async function startFakeServer(behaviour: (index: number) => Behaviour): Promise<FakeServer> {
  let count = 0
  const sockets = new Set<net.Socket>()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
    socket.on("error", () => {})
    const mode = behaviour(count++)
    socket.once("data", () => {
      if (mode === "drop") return socket.destroy()
      if (mode === "tls-drop") {
        socket.write("S")
        // Encerra com FIN ao receber o ClientHello: o mesmo efeito de um proxy que fecha durante o handshake.
        return socket.once("data", () => socket.end())
      }
      if (mode === "auth-timeout") {
        // Mesma resposta do proxy do Neon quando o startup não conclui a autenticação a tempo.
        return socket.end(errorResponse({ S: "ERROR", M: "Authentication timed out" }))
      }
      const authOk = Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0])
      const ready = Buffer.from([0x5a, 0, 0, 0, 5, 0x49])
      socket.write(Buffer.concat([authOk, ready]))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as net.AddressInfo
  return {
    port,
    connections: () => count,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy()
        server.close(() => resolve())
      }),
  }
}

const servers: FakeServer[] = []
after(async () => {
  await Promise.all(servers.map((server) => server.close()))
})

async function serve(behaviour: Parameters<typeof startFakeServer>[0]) {
  const server = await startFakeServer(behaviour)
  servers.push(server)
  return server
}

const connectionString = (port: number) => `postgresql://app@127.0.0.1:${port}/neondb`

async function captureRealError(port: number, ssl: pg.ClientConfig["ssl"]): Promise<Error> {
  const client = new pg.Client({ connectionString: connectionString(port), ssl })
  try {
    await client.connect()
  } catch (error) {
    return error as Error
  }
  await client.end()
  throw new Error("conexão deveria ter falhado")
}

describe("isTransientConnectionError com os erros reais do pg", () => {
  test("queda após o startup reproduz 'Connection terminated unexpectedly' e é transitória", async () => {
    const server = await serve(() => "drop")
    const error = await captureRealError(server.port, false)
    assert.match(error.message, /Connection terminated unexpectedly/)
    assert.equal(isTransientConnectionError(error), true)
  })

  test("queda durante o handshake TLS reproduz o erro de socket e é transitória", async () => {
    const server = await serve(() => "tls-drop")
    const error = await captureRealError(server.port, { rejectUnauthorized: false })
    assert.match(error.message, /Client network socket disconnected before secure TLS connection was established/)
    assert.equal(isTransientConnectionError(error), true)
  })

  test("'Authentication timed out' do proxy chega como DatabaseError do pg e é transitório", async () => {
    const server = await serve(() => "auth-timeout")
    const error = await captureRealError(server.port, false)
    assert.equal(error.message, "Authentication timed out")
    assert.equal(error.name, "error")
    assert.equal(isTransientConnectionError(error), true)
  })

  test("só a mensagem exata do timeout de autenticação é repetida", () => {
    assert.equal(isTransientConnectionError(new Error("Authentication timed out")), true)
    assert.equal(isTransientConnectionError(new Error("password authentication failed: Authentication timed out?")), false)
  })

  test("erros de query, autenticação e saturação do pool não são repetidos", () => {
    const authError = Object.assign(new Error('password authentication failed for user "app"'), { code: "28P01" })
    assert.equal(isTransientConnectionError(authError), false)
    assert.equal(isTransientConnectionError(Object.assign(new Error("duplicate key"), { code: "23505" })), false)
    assert.equal(isTransientConnectionError(new Error("timeout exceeded when trying to connect")), false)
    assert.equal(isTransientConnectionError("Connection terminated unexpectedly"), false)
  })

  test("códigos de rede transitórios são reconhecidos", () => {
    for (const code of ["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "EAI_AGAIN"]) {
      assert.equal(isTransientConnectionError(Object.assign(new Error("x"), { code })), true, code)
    }
  })
})

describe("connectWithRetry", () => {
  test("repete falhas transitórias e devolve a conexão", async () => {
    let calls = 0
    const retries: number[] = []
    const result = await connectWithRetry(
      async () => {
        calls++
        if (calls < 3) throw new Error("Connection terminated unexpectedly")
        return "conn"
      },
      { ...noWait, onRetry: (_error, attempt) => retries.push(attempt) },
    )
    assert.equal(result, "conn")
    assert.equal(calls, 3)
    assert.deepEqual(retries, [1, 2])
  })

  test("não repete erro não transitório", async () => {
    let calls = 0
    await assert.rejects(
      connectWithRetry(async () => {
        calls++
        throw Object.assign(new Error("password authentication failed"), { code: "28P01" })
      }, noWait),
      /password authentication failed/,
    )
    assert.equal(calls, 1)
  })

  test("desiste após o limite e propaga o erro original", async () => {
    let calls = 0
    await assert.rejects(
      connectWithRetry(async () => {
        calls++
        throw new Error("Connection terminated unexpectedly")
      }, { ...noWait, retries: 2 }),
      /Connection terminated unexpectedly/,
    )
    assert.equal(calls, 3)
  })

  test("aplica backoff exponencial entre tentativas", async () => {
    const waits: number[] = []
    await connectWithRetry(
      (() => {
        let calls = 0
        return async () => {
          if (++calls < 3) throw new Error("Connection terminated unexpectedly")
          return true
        }
      })(),
      { baseDelayMs: 100, sleep: async (ms) => void waits.push(ms) },
    )
    assert.deepEqual(waits, [100, 200])
  })
})

describe("createPool", () => {
  test("usa timeouts explícitos e registra listener de erro para clientes ociosos", async () => {
    const pool = createPool({ connectionString: connectionString(1) })
    const options = (pool as unknown as { options: pg.PoolConfig }).options
    assert.equal(options.max, POOL_DEFAULTS.max)
    assert.equal(options.idleTimeoutMillis, POOL_DEFAULTS.idleTimeoutMillis)
    assert.equal(options.connectionTimeoutMillis, POOL_DEFAULTS.connectionTimeoutMillis)
    assert.ok(pool.listenerCount("error") >= 1)
    pool.emit("error", new Error("Connection terminated unexpectedly"), {} as pg.PoolClient)
    await pool.end()
  })

  test("pool.connect() (caminho do Better Auth/Kysely) se recupera de uma queda e conecta", async () => {
    const server = await serve((index) => (index === 0 ? "drop" : "ok"))
    const retried: string[] = []
    const pool = createPool(
      { connectionString: connectionString(server.port) },
      { ...noWait, onRetry: (error) => retried.push((error as Error).message) },
    )
    const client = await pool.connect()
    client.release()
    await pool.end()
    assert.equal(server.connections(), 2)
    assert.deepEqual(retried, ["Connection terminated unexpectedly"])
  })

  test("pool.connect() se recupera de 'Authentication timed out' (erro de /onboarding às 14:24)", async () => {
    const server = await serve((index) => (index === 0 ? "auth-timeout" : "ok"))
    const retried: string[] = []
    const pool = createPool(
      { connectionString: connectionString(server.port) },
      { ...noWait, onRetry: (error) => retried.push((error as Error).message) },
    )
    const client = await pool.connect()
    client.release()
    await pool.end()
    assert.equal(server.connections(), 2)
    assert.deepEqual(retried, ["Authentication timed out"])
  })

  test("timeout de autenticação persistente desiste após o limite e propaga o erro", async () => {
    const server = await serve(() => "auth-timeout")
    const pool = createPool({ connectionString: connectionString(server.port) }, { ...noWait, retries: 2 })
    await assert.rejects(pool.connect(), { message: "Authentication timed out" })
    await pool.end()
    assert.equal(server.connections(), 3)
  })

  test("pool.connect() com TLS repete quedas no handshake antes de desistir", async () => {
    const server = await serve(() => "tls-drop")
    const pool = createPool(
      { connectionString: connectionString(server.port), ssl: { rejectUnauthorized: false } },
      { ...noWait, retries: 2 },
    )
    await assert.rejects(pool.connect(), /Client network socket disconnected before secure TLS connection/)
    await pool.end()
    assert.equal(server.connections(), 3)
  })

  test("pool.query() (caminho do Drizzle) também repete e propaga o erro quando a queda persiste", async () => {
    const server = await serve(() => "drop")
    const pool = createPool({ connectionString: connectionString(server.port) }, { ...noWait, retries: 2 })
    await assert.rejects(pool.query("select 1"), /Connection terminated unexpectedly/)
    await pool.end()
    assert.equal(server.connections(), 3)
  })

  test("erro não transitório no pool.connect() não gera nova tentativa", async () => {
    const pool = createPool({ connectionString: connectionString(1) }, noWait)
    pool.end()
    await assert.rejects(pool.connect(), /Cannot use a pool after calling end/)
  })
})
