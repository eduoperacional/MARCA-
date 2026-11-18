import type { QueryExec } from "@/lib/booking-guard"

const DAY_MS = 24 * 60 * 60_000

/**
 * Política inicial de retenção, restrita a dados técnicos temporários.
 * Clientes, agendamentos, pagamentos, despesas, cobrança (Asaas) e auditoria administrativa
 * ficam fora desta rotina de propósito: podem ter obrigação legal de conservação.
 */
export const RETENTION_POLICY = {
  /** Janelas de rate limit vencidas não têm efeito; a folga evita disputa com uma janela recém-renovada. */
  rateLimitGraceMs: 60 * 60_000,
  /** Convites não aceitos ficam visíveis por 30 dias após expirar ou ser revogados. */
  invitationGraceDays: 30,
  /** Entregas concluídas ficam 30 dias para diagnóstico e nova tentativa manual. */
  deliveryRetentionDays: 30,
} as const

export const RETENTION_TABLES = ["app_rate_limits", "invitations", "whatsapp_deliveries", "push_deliveries"] as const

export type RetentionTaskName = "rate_limits" | "invitations" | "whatsapp_deliveries" | "push_deliveries"

type RetentionTask = {
  name: RetentionTaskName
  table: (typeof RETENTION_TABLES)[number]
  key: string
  /** Condição com `$1` = data de corte. */
  where: string
  cutoff: (now: Date) => Date
}

const deliveryWhere =
  "(status in ('sent', 'skipped', 'failed') and updated_at < $1) or (status = 'pending' and expires_at < $1)"
const deliveryCutoff = (now: Date) => new Date(now.getTime() - RETENTION_POLICY.deliveryRetentionDays * DAY_MS)

export const RETENTION_TASKS: readonly RetentionTask[] = [
  {
    name: "rate_limits",
    table: "app_rate_limits",
    key: "key",
    where: "reset_at < $1",
    cutoff: (now) => new Date(now.getTime() - RETENTION_POLICY.rateLimitGraceMs),
  },
  {
    name: "invitations",
    table: "invitations",
    key: "id",
    where: "accepted_at is null and (expires_at < $1 or revoked_at < $1)",
    cutoff: (now) => new Date(now.getTime() - RETENTION_POLICY.invitationGraceDays * DAY_MS),
  },
  { name: "whatsapp_deliveries", table: "whatsapp_deliveries", key: "id", where: deliveryWhere, cutoff: deliveryCutoff },
  { name: "push_deliveries", table: "push_deliveries", key: "id", where: deliveryWhere, cutoff: deliveryCutoff },
]

/** Lote com `skip locked`: nunca espera nem remove linhas que a fila está processando. */
export function deleteBatchSql(task: RetentionTask, batchSize: number) {
  return `with doomed as (
      select ${task.key} from ${task.table} where ${task.where} limit ${batchSize} for update skip locked
    ), deleted as (
      delete from ${task.table} t using doomed where t.${task.key} = doomed.${task.key} returning 1
    )
    select count(*)::int as n from deleted`
}

export type RetentionTaskResult = { deleted: number; status: "ok" | "incomplete" | "missing_table" | "error" }
export type RetentionSummary = Record<RetentionTaskName, RetentionTaskResult>

const isMissingTable = (error: unknown) => (error as { code?: string })?.code === "42P01"

export async function runRetentionCleanup(
  exec: QueryExec,
  options: { now?: Date; batchSize?: number; timeBudgetMs?: number; log?: (message: string) => void } = {}
): Promise<RetentionSummary> {
  const now = options.now ?? new Date()
  const batchSize = options.batchSize ?? 1000
  const deadline = Date.now() + (options.timeBudgetMs ?? 40_000)
  const log = options.log ?? ((message: string) => console.error(message))
  const summary = {} as RetentionSummary

  for (const task of RETENTION_TASKS) {
    const result: RetentionTaskResult = { deleted: 0, status: "ok" }
    summary[task.name] = result
    const sql = deleteBatchSql(task, batchSize)
    const cutoff = task.cutoff(now)
    try {
      for (;;) {
        const { rows } = await exec.query(sql, [cutoff])
        const n = Number((rows[0] as { n: number | string }).n)
        result.deleted += n
        if (n < batchSize) break
        if (Date.now() >= deadline) {
          result.status = "incomplete"
          break
        }
      }
    } catch (error) {
      result.status = isMissingTable(error) ? "missing_table" : "error"
      // Só o código do erro: a mensagem do Postgres pode citar valores das linhas.
      if (result.status === "error") log(`[retention] falha em ${task.name} (código ${(error as { code?: string })?.code ?? "desconhecido"})`)
    }
  }
  return summary
}

export function formatRetentionSummary(summary: RetentionSummary) {
  return (Object.entries(summary) as [RetentionTaskName, RetentionTaskResult][])
    .map(([name, r]) => `${name} ${r.deleted}${r.status === "ok" ? "" : ` (${r.status})`}`)
    .join(" | ")
}
