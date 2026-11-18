import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { describe, test } from "node:test"

import { deliverEmail, type EmailMessage } from "../lib/email-delivery"

const TOKEN = "tok_9f8e7d6c5b4a3210SEGREDO"
const RESET_URL = `https://marcai.app/api/auth/reset-password/${TOKEN}?callbackURL=%2Fredefinir-senha`
const RECIPIENT = "cliente@example.com"

const resetMessage: EmailMessage = {
  to: RECIPIENT,
  subject: "Redefina sua senha da MARCAÍ",
  heading: "Redefinição de senha",
  body: "Recebemos um pedido para redefinir a senha da sua conta.",
  actionLabel: "Criar nova senha",
  actionUrl: RESET_URL,
}

function captureLogger() {
  const lines: string[] = []
  const record = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "))
  }
  return { lines, logger: { info: record, error: record } }
}

function assertNoSecrets(lines: string[]) {
  const output = lines.join("\n")
  assert.ok(!output.includes(TOKEN), "o token de redefinição apareceu no log")
  assert.ok(!output.includes(RESET_URL), "o link de redefinição apareceu no log")
  assert.ok(!output.includes("reset-password"), "o caminho de redefinição apareceu no log")
  assert.ok(!output.includes(RECIPIENT), "o e-mail do destinatário apareceu no log")
}

const ENV_KEYS = ["NODE_ENV"] as const

function withNodeEnv<T>(value: string, run: () => Promise<T>) {
  const env = process.env as Record<string, string | undefined>
  const previous = ENV_KEYS.map((key) => env[key])
  env.NODE_ENV = value
  return run().finally(() => {
    ENV_KEYS.forEach((key, index) => {
      if (previous[index] === undefined) delete env[key]
      else env[key] = previous[index]
    })
  })
}

describe("e-mail sem provedor configurado", () => {
  for (const nodeEnv of ["development", "production", "test"]) {
    test(`não registra link, token nem destinatário (NODE_ENV=${nodeEnv})`, async () => {
      const { lines, logger } = captureLogger()
      let fetchCalls = 0
      const fakeFetch = (async () => {
        fetchCalls++
        return new Response(null, { status: 200 })
      }) as typeof fetch

      const result = await withNodeEnv(nodeEnv, () => deliverEmail(resetMessage, {}, fakeFetch, logger))

      assert.deepEqual(result, { delivered: false })
      assert.equal(fetchCalls, 0)
      assert.ok(lines.length > 0, "deve registrar que o provedor não está configurado")
      assertNoSecrets(lines)
    })
  }
})

describe("e-mail com provedor configurado", () => {
  const env = { RESEND_API_KEY: "re_chave_de_teste", EMAIL_FROM: "MARCAÍ <nao-responda@marcai.app>" }

  test("envia o link apenas no corpo da requisição ao provedor", async () => {
    const { lines, logger } = captureLogger()
    let sentBody = ""
    const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = String(init?.body ?? "")
      return new Response(null, { status: 200 })
    }) as typeof fetch

    const result = await deliverEmail(resetMessage, env, fakeFetch, logger)

    assert.deepEqual(result, { delivered: true })
    const payload = JSON.parse(sentBody)
    assert.equal(payload.to, RECIPIENT)
    assert.ok(payload.text.includes(RESET_URL))
    assert.ok(payload.html.includes(TOKEN))
    assert.equal(lines.length, 0)
  })

  test("falha do provedor registra só o status HTTP", async () => {
    const { lines, logger } = captureLogger()
    const fakeFetch = (async () => new Response("erro", { status: 500 })) as typeof fetch

    const result = await deliverEmail(resetMessage, env, fakeFetch, logger)

    assert.deepEqual(result, { delivered: false })
    assertNoSecrets(lines)
    assert.ok(!lines.join("\n").includes(env.RESEND_API_KEY))
  })

  test("erro de rede não propaga nem registra dados sensíveis", async () => {
    const { lines, logger } = captureLogger()
    const fakeFetch = (async () => {
      throw new Error(`falha ao conectar enviando ${RESET_URL}`)
    }) as typeof fetch

    const result = await deliverEmail(resetMessage, env, fakeFetch, logger)

    assert.deepEqual(result, { delivered: false })
    assertNoSecrets(lines)
  })
})

describe("varredura do código-fonte", () => {
  const root = path.resolve(__dirname, "..")
  const skipDirs = new Set(["node_modules", ".next", ".git", "tests", "user_read_only_context"])

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (skipDirs.has(entry.name)) return []
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return sourceFiles(full)
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
    })
  }

  test("nenhum console.* registra actionUrl, url de auth ou token", () => {
    const offenders: string[] = []
    const logCall = /console\.(log|info|warn|error|debug)\(([^)]*)\)/g
    // Webhook tokens are logged only through describeWebhookRejection, covered by webhook-diagnostic.test.ts.
    const sensitive = /actionUrl|\burl\b|resetUrl|\blink\b|\btoken\b|reset/i
    for (const file of sourceFiles(root)) {
      const source = fs.readFileSync(file, "utf8")
      for (const match of source.matchAll(logCall)) {
        const args = match[2]
        const interpolated = [...args.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]).join(" ")
        const bareArgs = args.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "")
        if (sensitive.test(interpolated) || sensitive.test(bareArgs)) {
          offenders.push(`${path.relative(root, file)}: ${match[0]}`)
        }
      }
    }
    assert.deepEqual(offenders, [])
  })
})
