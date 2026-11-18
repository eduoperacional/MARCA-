"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"

import { saveProfessional, saveService } from "@/app/actions/catalog"
import { linkSelfAsProfessional } from "@/app/actions/onboarding"
import { FormAlert } from "@/components/auth/auth-shell"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, StepGuide, WeekScheduleEditor } from "@/components/onboarding/wizard-ui"
import type { WizardProfessional, WizardService } from "@/components/onboarding/types"
import { parseCurrencyInput } from "@/lib/currency-input"
import { formatCurrency } from "@/lib/format"
import type { DaySchedule } from "@/lib/types"

interface CatalogProps {
  pending: boolean
  onBack: () => void
  onContinue: () => void
}

function useInlineSave() {
  const router = useRouter()
  const [saving, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (save: () => Promise<{ ok: boolean; error?: string }>, onDone: () => void) => {
    setError(null)
    start(async () => {
      try {
        const result = await save()
        if (!result.ok) {
          setError(result.error ?? "Não foi possível salvar.")
          return
        }
        onDone()
        router.refresh()
      } catch {
        setError("Não foi possível salvar. Verifique sua conexão e tente novamente.")
      }
    })
  }
  return { saving, error, run }
}

function Footer({ pending, onBack, onContinue, canContinue, missing }: CatalogProps & { canContinue: boolean; missing: string }) {
  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      {!canContinue && <p className="text-sm text-muted-foreground">{missing}</p>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
          Voltar
        </Button>
        <Button type="button" size="lg" onClick={onContinue} disabled={pending || !canContinue}>
          Continuar
        </Button>
      </div>
    </div>
  )
}

export function ServicesStep({ services, professionalIds, ...nav }: CatalogProps & { services: WizardService[]; professionalIds: string[] }) {
  const { saving, error, run } = useInlineSave()
  const [formKey, setFormKey] = useState(0)
  const active = services.filter((s) => s.active)

  return (
    <div className="flex flex-col gap-5">
      <StepGuide topic="services" />
      {services.length > 0 && (
        <ul className="flex flex-col divide-y rounded-xl border" aria-label="Serviços cadastrados">
          {services.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{s.name}</span>
                <span className="text-xs text-muted-foreground">
                  {s.category} · {s.durationMin} min{s.active ? "" : " · inativo"}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{formatCurrency(s.price)}</span>
            </li>
          ))}
        </ul>
      )}
      <form
        key={formKey}
        className="flex flex-col gap-4 rounded-xl border border-dashed p-4"
        onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          const price = parseCurrencyInput(String(f.get("price") ?? ""))
          run(
            () =>
              saveService({
                name: String(f.get("name") ?? ""),
                category: String(f.get("category") ?? ""),
                description: String(f.get("description") ?? ""),
                price: price ?? NaN,
                durationMin: Number(f.get("duration") ?? 0),
                active: true,
                professionalIds,
              }),
            () => setFormKey((k) => k + 1)
          )
        }}
      >
        <p className="text-sm font-medium">{services.length ? "Adicionar outro serviço" : "Cadastre seu primeiro serviço"}</p>
        <FormAlert message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="svc-name" label="Nome do serviço">
            <Input id="svc-name" name="name" required maxLength={120} placeholder="Corte masculino" />
          </Field>
          <Field id="svc-category" label="Categoria">
            <Input id="svc-category" name="category" maxLength={60} placeholder="Cabelo" />
          </Field>
          <Field id="svc-price" label="Preço (R$)">
            <Input id="svc-price" name="price" inputMode="decimal" required pattern="^\d{1,6}([.,]\d{1,2})?$" placeholder="45,00" />
          </Field>
          <Field id="svc-duration" label="Duração (minutos)" hint="Múltiplos de 5, de 5 a 600.">
            <Input id="svc-duration" name="duration" type="number" min={5} max={600} step={5} required defaultValue={30} />
          </Field>
        </div>
        <Field id="svc-description" label="Descrição" hint="Opcional. Aparece para o cliente na página pública.">
          <Textarea id="svc-description" name="description" rows={2} maxLength={500} />
        </Field>
        <Button type="submit" variant="outline" disabled={saving} className="self-start">
          {saving ? "Salvando..." : "Salvar serviço"}
        </Button>
      </form>
      <Footer {...nav} canContinue={active.length > 0} missing="Cadastre ao menos um serviço ativo para continuar." />
    </div>
  )
}

export function ProfessionalsStep({
  professionals,
  services,
  openingHours,
  selfProfessionalId,
  ...nav
}: CatalogProps & {
  professionals: WizardProfessional[]
  services: WizardService[]
  openingHours: DaySchedule[]
  selfProfessionalId: string | null
}) {
  const { saving, error, run } = useInlineSave()
  const activeServices = services.filter((s) => s.active)
  const [formKey, setFormKey] = useState(0)
  const [schedule, setSchedule] = useState<DaySchedule[]>(openingHours)
  const [selected, setSelected] = useState<string[]>(activeServices.map((s) => s.id))
  const bookable = professionals.filter((p) => p.active && p.workDays > 0 && p.serviceIds.some((id) => activeServices.some((s) => s.id === id)))

  return (
    <div className="flex flex-col gap-5">
      <StepGuide topic="professionals" />
      <FormAlert message={error} />
      {professionals.length > 0 && (
        <ul className="flex flex-col divide-y rounded-xl border" aria-label="Profissionais cadastrados">
          {professionals.map((p) => {
            const ok = bookable.includes(p)
            return (
              <li key={p.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {ok ? `${p.serviceIds.length} serviço(s) · ${p.workDays} dia(s) de trabalho` : "Sem serviços vinculados ou dias de trabalho"}
                  </span>
                </span>
                {selfProfessionalId === p.id ? (
                  <span className="flex items-center gap-1 text-xs text-brand-light">
                    <Check className="size-3.5" aria-hidden /> Você
                  </span>
                ) : (
                  <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => run(() => linkSelfAsProfessional(p.id), () => {})}>
                    Sou eu
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <form
        key={formKey}
        className="flex flex-col gap-4 rounded-xl border border-dashed p-4"
        onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          run(
            () =>
              saveProfessional({
                name: String(f.get("name") ?? ""),
                phone: String(f.get("phone") ?? "") || null,
                email: String(f.get("email") ?? "") || null,
                specialties: String(f.get("specialties") ?? "") || null,
                workSchedule: schedule,
                active: true,
                serviceIds: selected,
              }),
            () => setFormKey((k) => k + 1)
          )
        }}
      >
        <p className="text-sm font-medium">{professionals.length ? "Adicionar outro profissional" : "Cadastre quem atende"}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="pro-name" label="Nome">
            <Input id="pro-name" name="name" required maxLength={120} placeholder="Ana Souza" />
          </Field>
          <Field id="pro-specialties" label="Especialidades">
            <Input id="pro-specialties" name="specialties" maxLength={200} placeholder="Coloração, cortes femininos" />
          </Field>
          <Field id="pro-phone" label="Telefone (opcional)">
            <Input id="pro-phone" name="phone" type="tel" placeholder="(11) 97777-6666" />
          </Field>
          <Field id="pro-email" label="E-mail (opcional)">
            <Input id="pro-email" name="email" type="email" />
          </Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 text-sm font-medium">Serviços que realiza</legend>
          {activeServices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Cadastre serviços na etapa anterior para vinculá-los.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {activeServices.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.includes(s.id)}
                    onCheckedChange={(v) => setSelected((cur) => (v ? [...cur, s.id] : cur.filter((id) => id !== s.id)))}
                  />
                  {s.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Dias e horários de trabalho</p>
          <p className="text-xs text-muted-foreground">Já vem com o horário da loja. Ajuste se precisar.</p>
          <WeekScheduleEditor label="Jornada do profissional" value={schedule} onChange={setSchedule} />
        </div>
        <Button type="submit" variant="outline" disabled={saving} className="self-start">
          {saving ? "Salvando..." : "Salvar profissional"}
        </Button>
      </form>
      <Footer {...nav} canContinue={bookable.length > 0} missing="Cadastre um profissional ativo com serviços vinculados e ao menos um dia de trabalho." />
    </div>
  )
}
