/**
 * O `pg` 8.x já trata `sslmode=prefer|require|verify-ca` como `verify-full` e emite um aviso de
 * segurança a cada conexão nova. Explicitamos `verify-full` para manter exatamente o comportamento
 * atual (TLS com verificação de certificado e hostname) sem o aviso, e sem alterar a variável de ambiente.
 * Quem optar pela semântica do libpq (`uselibpqcompat=true`) ou por outro modo não é afetado.
 */
const ALIASED_SSL_MODES = new Set(["prefer", "require", "verify-ca"])

export function normalizeSslMode(connectionString: string | undefined): string | undefined {
  if (!connectionString) return connectionString
  let url: URL
  try {
    url = new URL(connectionString)
  } catch {
    return connectionString
  }
  const params = url.searchParams
  const sslmode = params.get("sslmode")
  if (!sslmode || !ALIASED_SSL_MODES.has(sslmode)) return connectionString
  if (params.get("uselibpqcompat") === "true") return connectionString
  params.set("sslmode", "verify-full")
  return url.toString()
}
