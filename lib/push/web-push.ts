import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from "node:crypto"

/**
 * Web Push sem dependências: assinatura VAPID (RFC 8292) e criptografia aes128gcm (RFC 8291 / RFC 8188)
 * com `node:crypto`. Não acessa banco; o envio HTTP fica em `sendWebPush`.
 */

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export interface VapidKeys {
  publicKey: string
  privateKey: string
  subject: string
}

export type PushSendResult =
  | { ok: true; status: number }
  | { ok: false; kind: "gone" | "retry" | "fail"; status: number; error: string }

const RECORD_SIZE = 4096
/** Limite seguro de conteúdo: registro de 4096 bytes menos cabeçalho, tag e delimitador. */
export const MAX_PAYLOAD_BYTES = 3000

const b64url = (buf: Uint8Array) => Buffer.from(buf).toString("base64url")
const fromB64url = (value: string) => Buffer.from(value, "base64url")

/** Serviços de push dos navegadores. Restringir os destinos evita usar o servidor para chamar URLs arbitrárias. */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
]

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1024) return false
  try {
    const url = new URL(endpoint)
    return url.protocol === "https:" && !url.port && PUSH_HOSTS.some((re) => re.test(url.hostname))
  } catch {
    return false
  }
}

/** p256dh: ponto P-256 não comprimido (65 bytes). auth: segredo de 16 bytes. */
export function isValidSubscriptionKeys(p256dh: unknown, auth: unknown): boolean {
  if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) return false
  const pub = fromB64url(p256dh)
  return pub.length === 65 && pub[0] === 4 && fromB64url(auth).length === 16
}

export function generateVapidKeys() {
  const ecdh = createECDH("prime256v1")
  ecdh.generateKeys()
  const priv = ecdh.getPrivateKey()
  const padded = Buffer.concat([Buffer.alloc(Math.max(0, 32 - priv.length)), priv])
  return { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(padded) }
}

export function isValidVapidKeys(keys: Partial<VapidKeys> | null | undefined): keys is VapidKeys {
  if (!keys?.publicKey || !keys.privateKey || !keys.subject) return false
  const pub = fromB64url(keys.publicKey)
  return pub.length === 65 && pub[0] === 4 && fromB64url(keys.privateKey).length === 32 && /^(mailto:|https:)/.test(keys.subject)
}

/** Cabeçalho Authorization no formato `vapid t=<JWT ES256>, k=<chave pública>`. */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, nowMs = Date.now()) {
  const pub = fromB64url(keys.publicKey)
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })))
  const claims = b64url(
    Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: keys.subject }))
  )
  const unsigned = `${header}.${claims}`
  const key = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: b64url(fromB64url(keys.privateKey)),
      x: b64url(pub.subarray(1, 33)),
      y: b64url(pub.subarray(33, 65)),
    },
    format: "jwk",
  })
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" })
  return `vapid t=${unsigned}.${b64url(signature)}, k=${b64url(pub)}`
}

/** Corpo cifrado aes128gcm: salt(16) | rs(4) | idlen(1) | chave efêmera(65) | conteúdo + tag. */
export function encryptPayload(plaintext: Buffer, target: Pick<PushTarget, "p256dh" | "auth">) {
  if (plaintext.length > MAX_PAYLOAD_BYTES) throw new Error("payload_too_large")
  const uaPublic = fromB64url(target.p256dh)
  const authSecret = fromB64url(target.auth)

  const ecdh = createECDH("prime256v1")
  ecdh.generateKeys()
  const asPublic = ecdh.getPublicKey()
  const sharedSecret = ecdh.computeSecret(uaPublic)

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic])
  const ikm = Buffer.from(hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32))
  const salt = randomBytes(16)
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16))
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12))

  const cipher = createCipheriv("aes-128-gcm", cek, nonce)
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])

  const header = Buffer.alloc(21)
  salt.copy(header, 0)
  header.writeUInt32BE(RECORD_SIZE, 16)
  header[20] = asPublic.length
  return Buffer.concat([header, asPublic, encrypted])
}

/**
 * 404/410: inscrição expirada ou removida pelo navegador (não tente de novo).
 * 429 e 5xx: falha temporária. Demais 4xx: falha definitiva (payload ou VAPID inválidos).
 */
export function classifyPushStatus(status: number): "sent" | "gone" | "retry" | "fail" {
  if (status >= 200 && status < 300) return "sent"
  if (status === 404 || status === 410) return "gone"
  if (status === 408 || status === 429 || status >= 500) return "retry"
  return "fail"
}

export async function sendWebPush(
  target: PushTarget,
  payload: string,
  keys: VapidKeys,
  options: { ttlSeconds: number; topic?: string; urgency?: "normal" | "high"; fetchImpl?: typeof fetch }
): Promise<PushSendResult> {
  if (!isAllowedPushEndpoint(target.endpoint)) return { ok: false, kind: "gone", status: 0, error: "endpoint_not_allowed" }
  const body = encryptPayload(Buffer.from(payload, "utf8"), target)
  const headers: Record<string, string> = {
    Authorization: vapidAuthorization(target.endpoint, keys),
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(Math.max(0, Math.floor(options.ttlSeconds))),
    Urgency: options.urgency ?? "high",
  }
  if (options.topic) headers.Topic = options.topic.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32)

  const response = await (options.fetchImpl ?? fetch)(target.endpoint, {
    method: "POST",
    headers,
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(10_000),
  })
  const kind = classifyPushStatus(response.status)
  if (kind === "sent") return { ok: true, status: response.status }
  const text = await response.text().catch(() => "")
  return { ok: false, kind, status: response.status, error: `HTTP ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}` }
}
