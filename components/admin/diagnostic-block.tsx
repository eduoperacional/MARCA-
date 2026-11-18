import { ToneBadge } from "@/components/admin/tone-badge"
import type { DiagnosticBlock as Block } from "@/lib/admin/promo-diagnostics"
import { formatDateTime } from "@/lib/format"

function formatValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>
  if (typeof value === "boolean") return <ToneBadge tone={value ? "brand" : "muted"}>{value ? "true" : "false"}</ToneBadge>
  if (value instanceof Date) return formatDateTime(value)
  if (Array.isArray(value)) return value.join(", ")
  if (typeof value === "object") return <code className="font-mono text-xs">{JSON.stringify(value)}</code>
  return String(value)
}

export function DiagnosticBlock({ block, index }: { block: Block; index: number }) {
  const columns = block.rows[0] ? Object.keys(block.rows[0]) : []
  const headingId = `diag-${block.key}`

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-xl border bg-card/60 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="font-heading text-base font-semibold">
            <span className="mr-2 font-mono text-sm text-muted-foreground">{index + 1}.</span>
            {block.title}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{block.description}</p>
        </div>
        {block.error ? (
          <ToneBadge tone="danger">Erro na consulta</ToneBadge>
        ) : (
          <ToneBadge tone={block.rows.length ? "success" : "muted"}>
            {block.rows.length} {block.rows.length === 1 ? "linha" : "linhas"}
          </ToneBadge>
        )}
      </header>

      {block.expectation && (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm leading-relaxed">
          <span className="font-medium">Esperado: </span>
          {block.expectation}
        </p>
      )}

      {block.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
          {block.error}
        </p>
      ) : block.rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col" className="whitespace-nowrap px-3 py-2 font-mono font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-muted/40">
                  {columns.map((column) => (
                    <td key={column} className="whitespace-nowrap px-3 py-2 align-top">
                      {formatValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
