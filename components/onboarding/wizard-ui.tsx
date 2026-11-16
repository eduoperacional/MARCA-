"use client"

import { useState } from "react"
import { Lightbulb } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { HELP_TOPICS, type HelpTopicKey } from "@/lib/help-topics"
import { WEEKDAY_LABELS } from "@/lib/onboarding"
import type { DaySchedule } from "@/lib/types"

export type ActionResult = { ok: true; ready?: boolean } | { ok: false; error: string }
export type Saver = () => Promise<ActionResult>

export const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function Field({ id, label, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function StepGuide({ topic }: { topic: HelpTopicKey }) {
  const t = HELP_TOPICS[topic]
  return (
    <aside className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
      <p className="leading-relaxed text-muted-foreground">{t.intro}</p>
      <ul className="flex list-disc flex-col gap-1 pl-4 leading-relaxed">
        {t.howTo.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-brand-light" aria-hidden />
        <span>
          <span className="font-medium text-foreground">Exemplo: </span>
          {t.example}
        </span>
      </p>
    </aside>
  )
}

export function StepActions({
  pending,
  onBack,
  label = "Salvar e continuar",
  disabled,
}: {
  pending: boolean
  onBack?: () => void
  label?: string
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
          Voltar
        </Button>
      ) : (
        <span />
      )}
      <Button type="submit" size="lg" disabled={pending || disabled}>
        {pending ? "Salvando..." : label}
      </Button>
    </div>
  )
}

const MAX_IMAGE_BYTES = 500 * 1024

export function ImagePicker({ id, label, value, onChange }: { id: string; label: string; value: string | null; onChange: (v: string | null) => void }) {
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={`${label} atual`} className="size-full object-cover" />
          ) : (
            <span className="text-xs text-muted-foreground">Vazio</span>
          )}
        </div>
        <Input
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            if (file.size > MAX_IMAGE_BYTES) {
              setError("A imagem deve ter no máximo 500 KB.")
              e.target.value = ""
              return
            }
            setError(null)
            const reader = new FileReader()
            reader.onload = () => onChange(String(reader.result))
            reader.readAsDataURL(file)
          }}
        />
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            Remover
          </Button>
        )}
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">PNG, JPG ou WEBP até 500 KB. Opcional.</p>
      )}
    </div>
  )
}

/** Editor semanal usado no funcionamento do estabelecimento e na jornada dos profissionais. */
export function WeekScheduleEditor({ value, onChange, label }: { value: DaySchedule[]; onChange: (v: DaySchedule[]) => void; label: string }) {
  const update = (weekday: number, patch: Partial<DaySchedule>) =>
    onChange(value.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)))

  return (
    <div role="group" aria-label={label} className="flex flex-col divide-y rounded-xl border">
      {value.map((day) => {
        const name = WEEKDAY_LABELS[day.weekday]
        return (
          <div key={day.weekday} className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
            <label className="flex w-32 items-center gap-3 text-sm font-medium">
              <Switch checked={day.active} onCheckedChange={(v) => update(day.weekday, { active: v })} aria-label={`Atende ${name}`} />
              {name}
            </label>
            {day.active ? (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm sm:flex sm:flex-wrap">
                <Input type="time" aria-label={`Abertura ${name}`} value={day.start} onChange={(e) => update(day.weekday, { start: e.target.value })} className="sm:w-28" />
                <span className="text-center text-muted-foreground">até</span>
                <Input type="time" aria-label={`Fechamento ${name}`} value={day.end} onChange={(e) => update(day.weekday, { end: e.target.value })} className="sm:w-28" />
                <Input type="time" aria-label={`Início da pausa ${name}`} value={day.breakStart ?? ""} onChange={(e) => update(day.weekday, { breakStart: e.target.value || null })} className="sm:w-28" />
                <span className="text-center text-muted-foreground">pausa</span>
                <Input type="time" aria-label={`Fim da pausa ${name}`} value={day.breakEnd ?? ""} onChange={(e) => update(day.weekday, { breakEnd: e.target.value || null })} className="sm:w-28" />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Fechado (folga)</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
