"use client"

import { useState, useTransition } from "react"

import { checkSlugAvailability, savePageStep, saveRulesStep } from "@/app/actions/onboarding"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Field, ImagePicker, StepActions, StepGuide, selectClass, type Saver } from "@/components/onboarding/wizard-ui"
import type { WizardBusiness } from "@/components/onboarding/types"
import { MIN_ADVANCE_OPTIONS, SLOT_INTERVALS } from "@/lib/onboarding"
import { slugify } from "@/lib/slug"
import { cn } from "@/lib/utils"

interface StepProps {
  business: WizardBusiness
  pending: boolean
  onSubmit: (save: Saver) => void
  onBack: () => void
}

export function RulesStep({ business, pending, onSubmit, onBack }: StepProps) {
  const [interval, setInterval] = useState(business.slotIntervalMin)
  const [advance, setAdvance] = useState(business.minAdvanceMin)
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(() => saveRulesStep({ slotIntervalMin: interval, minAdvanceMin: advance }))
      }}
    >
      <StepGuide topic="rules" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="interval" label="Intervalo entre horários" hint="De quanto em quanto tempo os horários são oferecidos.">
          <select id="interval" value={interval} onChange={(e) => setInterval(Number(e.target.value))} className={selectClass}>
            {SLOT_INTERVALS.map((m) => (
              <option key={m} value={m} className="bg-popover">{m} minutos</option>
            ))}
          </select>
        </Field>
        <Field id="advance" label="Antecedência mínima" hint="Tempo mínimo entre o momento da marcação e o atendimento.">
          <select id="advance" value={advance} onChange={(e) => setAdvance(Number(e.target.value))} className={selectClass}>
            {MIN_ADVANCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-popover">{o.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <StepActions pending={pending} onBack={onBack} />
    </form>
  )
}

export function PageStep({ business, pending, onSubmit, onBack }: StepProps) {
  const [slug, setSlug] = useState(business.slug)
  const [slugStatus, setSlugStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [checking, startChecking] = useTransition()
  const [cover, setCover] = useState(business.coverUrl)
  const [online, setOnline] = useState(business.onlineBookingEnabled)

  const checkSlug = () =>
    startChecking(async () => {
      const result = await checkSlugAvailability(slug)
      setSlugStatus({ ok: result.available, text: result.available ? "Endereço disponível." : result.reason ?? "Indisponível." })
    })

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        onSubmit(() => savePageStep({ slug, description: String(f.get("description") ?? ""), coverUrl: cover, onlineBookingEnabled: online }))
      }}
    >
      <StepGuide topic="page" />
      <Field id="slug" label="Endereço da sua página">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 items-center rounded-md border border-input focus-within:ring-2 focus-within:ring-ring">
            <span className="pl-3 text-sm text-muted-foreground">/agendar/</span>
            <input
              id="slug"
              value={slug}
              onChange={(e) => {
                setSlug(slugify(e.target.value))
                setSlugStatus(null)
              }}
              onBlur={() => slug && checkSlug()}
              className="h-9 min-w-0 flex-1 bg-transparent pr-3 text-sm outline-none"
              aria-describedby="slug-status"
              required
              minLength={3}
              maxLength={48}
            />
          </div>
          <Button type="button" variant="outline" onClick={checkSlug} disabled={checking || !slug}>
            {checking ? "Verificando..." : "Verificar"}
          </Button>
        </div>
        <p id="slug-status" aria-live="polite" className={cn("text-xs", slugStatus?.ok ? "text-brand-light" : slugStatus ? "text-destructive" : "text-muted-foreground")}>
          {slugStatus?.text ?? "Letras minúsculas, números e hífens."}
        </p>
      </Field>
      <Field id="description" label="Descrição curta" hint="Até 500 caracteres. Aparece no topo da sua página.">
        <Textarea id="description" name="description" rows={3} maxLength={500} defaultValue={business.description} />
      </Field>
      <ImagePicker id="cover" label="Imagem de capa" value={cover} onChange={setCover} />
      <label className="flex items-center justify-between gap-4 rounded-xl border p-4">
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Publicar agendamento online</span>
          <span className="text-xs leading-relaxed text-muted-foreground">Com esta opção ativa, os clientes podem marcar horários pelo link.</span>
        </span>
        <Switch checked={online} onCheckedChange={setOnline} />
      </label>
      <StepActions pending={pending} onBack={onBack} label={online ? "Salvar e publicar" : "Salvar"} disabled={slugStatus?.ok === false} />
    </form>
  )
}
