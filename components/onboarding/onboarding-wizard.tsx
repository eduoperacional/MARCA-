"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"

import {
  checkSlugAvailability,
  completeProfessionalStep,
  saveBusinessStep,
  saveHoursStep,
  saveIdentityStep,
  saveServiceStep,
} from "@/app/actions/onboarding"
import { FormAlert } from "@/components/auth/auth-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { BRAZIL_STATES, BUSINESS_SEGMENTS, ONBOARDING_STEPS, WEEKDAY_LABELS } from "@/lib/onboarding"
import { slugify } from "@/lib/slug"
import type { DaySchedule } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Draft {
  step: number
  name: string
  segment: string
  phone: string
  address: string
  city: string
  state: string
  displayName: string
  description: string
  slug: string
  primaryColor: string
  logoUrl: string | null
  coverUrl: string | null
  openingHours: DaySchedule[]
  slotIntervalMin: number
  minAdvanceMin: number
  onlineBookingEnabled: boolean
}

type Saver = () => Promise<{ ok: true } | { ok: false; error: string }>

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const DEFAULT_HOURS: DaySchedule[] = WEEKDAY_LABELS.map((_, weekday) => ({
  weekday,
  active: weekday >= 1 && weekday <= 6,
  start: "09:00",
  end: weekday === 6 ? "14:00" : "18:00",
  breakStart: null,
  breakEnd: null,
}))

export function OnboardingWizard({
  userName,
  draft,
  services,
}: {
  userName: string
  draft: Draft | null
  services: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [step, setStep] = useState(Math.min(Math.max(draft?.step ?? 1, 1), 5))
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = (save: Saver, onDone: () => void) => {
    setError(null)
    startTransition(async () => {
      const result = await save()
      if (!result.ok) {
        setError(result.error)
        return
      }
      onDone()
    })
  }

  const next = (save: Saver) =>
    run(save, () => {
      setStep((s) => s + 1)
      router.refresh()
      window.scrollTo({ top: 0, behavior: "smooth" })
    })

  const finish = (save: Saver) =>
    run(save, () => {
      router.replace("/painel?bemvindo=1")
      router.refresh()
    })

  const current = ONBOARDING_STEPS[step - 1]
  const maxReached = draft?.step ?? 1

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex items-center gap-2" aria-label="Etapas do cadastro">
        {ONBOARDING_STEPS.map((s) => {
          const done = s.step < step
          const reachable = s.step <= maxReached && s.step !== step
          return (
            <li key={s.step} className="flex flex-1 flex-col gap-2">
              <button
                type="button"
                disabled={!reachable || pending}
                onClick={() => setStep(s.step)}
                aria-current={s.step === step ? "step" : undefined}
                aria-label={`Etapa ${s.step}: ${s.title}`}
                className={cn(
                  "h-1.5 rounded-full transition-colors",
                  s.step <= step ? "bg-primary" : "bg-muted",
                  reachable && "cursor-pointer hover:opacity-80"
                )}
              />
              <span className={cn("hidden text-xs sm:block", s.step === step ? "text-foreground" : "text-muted-foreground")}>
                {done && <Check className="mr-1 inline size-3" aria-hidden />}
                {s.title}
              </span>
            </li>
          )
        })}
      </ol>

      <section className="flex flex-col gap-6 rounded-2xl border bg-card/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <header className="flex flex-col gap-1">
          <p className="text-xs font-medium tracking-wide text-brand-light uppercase">
            Etapa {step} de {ONBOARDING_STEPS.length}
          </p>
          <h1 className="font-heading text-2xl font-semibold text-balance">
            {step === 1 ? `Olá, ${userName.split(" ")[0]}! Vamos configurar seu negócio` : current.title}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{current.description}. Seu progresso é salvo a cada etapa.</p>
        </header>
        <FormAlert message={error} />
        {step === 1 && <BusinessStep draft={draft} pending={pending} onSubmit={next} />}
        {step === 2 && <IdentityStep draft={draft} pending={pending} onSubmit={next} onBack={() => setStep(1)} />}
        {step === 3 && <HoursStep draft={draft} pending={pending} onSubmit={next} onBack={() => setStep(2)} />}
        {step === 4 && <ServiceStep pending={pending} onSubmit={next} onBack={() => setStep(3)} />}
        {step === 5 && <ProfessionalStep services={services} pending={pending} onSubmit={finish} onBack={() => setStep(4)} />}
      </section>
    </div>
  )
}

function Field({ id, label, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function StepActions({ pending, onBack, label = "Continuar" }: { pending: boolean; onBack?: () => void; label?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
          Voltar
        </Button>
      ) : (
        <span />
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Salvando..." : label}
      </Button>
    </div>
  )
}

function BusinessStep({ draft, pending, onSubmit }: { draft: Draft | null; pending: boolean; onSubmit: (s: Saver) => void }) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        const get = (k: string) => String(f.get(k) ?? "")
        onSubmit(() =>
          saveBusinessStep({
            name: get("name"),
            segment: get("segment"),
            phone: get("phone"),
            address: get("address"),
            city: get("city"),
            state: get("state"),
          })
        )
      }}
    >
      <Field id="name" label="Nome comercial">
        <Input id="name" name="name" required defaultValue={draft?.name} placeholder="Barbearia do Centro" />
      </Field>
      <Field id="segment" label="Tipo de negócio">
        <select id="segment" name="segment" required defaultValue={draft?.segment ?? ""} className={selectClass}>
          <option value="" disabled className="bg-popover">Selecione</option>
          {BUSINESS_SEGMENTS.map((s) => (
            <option key={s.value} value={s.value} className="bg-popover">{s.label}</option>
          ))}
        </select>
      </Field>
      <Field id="phone" label="Telefone / WhatsApp do estabelecimento">
        <Input id="phone" name="phone" type="tel" required defaultValue={draft?.phone} placeholder="(11) 99999-9999" />
      </Field>
      <Field id="address" label="Endereço">
        <Input id="address" name="address" required defaultValue={draft?.address} placeholder="Rua, número, bairro" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field id="city" label="Cidade">
          <Input id="city" name="city" required defaultValue={draft?.city} />
        </Field>
        <Field id="state" label="Estado">
          <select id="state" name="state" required defaultValue={draft?.state ?? ""} className={selectClass}>
            <option value="" disabled className="bg-popover">UF</option>
            {BRAZIL_STATES.map((uf) => (
              <option key={uf} value={uf} className="bg-popover">{uf}</option>
            ))}
          </select>
        </Field>
      </div>
      <StepActions pending={pending} />
    </form>
  )
}

const MAX_IMAGE_BYTES = 700 * 1024

function ImagePicker({ id, label, value, onChange }: { id: string; label: string; value: string | null; onChange: (v: string | null) => void }) {
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="size-full object-cover" />
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
              setError("A imagem deve ter no máximo 700 KB.")
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
      {error ? <p className="text-xs text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">PNG, JPG ou WEBP até 700 KB. Opcional.</p>}
    </div>
  )
}

function IdentityStep({
  draft,
  pending,
  onSubmit,
  onBack,
}: {
  draft: Draft | null
  pending: boolean
  onSubmit: (s: Saver) => void
  onBack: () => void
}) {
  const [slug, setSlug] = useState(draft?.slug ?? "")
  const [slugStatus, setSlugStatus] = useState<string | null>(null)
  const [checking, startChecking] = useTransition()
  const [color, setColor] = useState(draft?.primaryColor ?? "#7B3FF2")
  const [logo, setLogo] = useState(draft?.logoUrl ?? null)
  const [cover, setCover] = useState(draft?.coverUrl ?? null)

  const checkSlug = () =>
    startChecking(async () => {
      const result = await checkSlugAvailability(slug)
      setSlugStatus(result.available ? "Disponível" : result.reason ?? "Indisponível")
    })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        onSubmit(() =>
          saveIdentityStep({
            displayName: String(f.get("displayName") ?? ""),
            description: String(f.get("description") ?? ""),
            slug,
            primaryColor: color,
            logoUrl: logo,
            coverUrl: cover,
          })
        )
      }}
    >
      <Field id="displayName" label="Nome de exibição">
        <Input id="displayName" name="displayName" required defaultValue={draft?.displayName} />
      </Field>
      <Field id="description" label="Descrição curta" hint="Aparece na sua página pública de agendamento.">
        <Textarea id="description" name="description" rows={3} maxLength={500} defaultValue={draft?.description} />
      </Field>
      <Field id="slug" label="Endereço público">
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
            />
          </div>
          <Button type="button" variant="outline" onClick={checkSlug} disabled={checking || !slug}>
            {checking ? "Verificando..." : "Verificar"}
          </Button>
        </div>
        <p id="slug-status" aria-live="polite" className={cn("text-xs", slugStatus === "Disponível" ? "text-brand-light" : "text-muted-foreground")}>
          {slugStatus ?? "Use letras minúsculas, números e hífens."}
        </p>
      </Field>
      <Field id="color" label="Cor principal">
        <div className="flex items-center gap-3">
          <input id="color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 cursor-pointer rounded-md border bg-transparent" />
          <span className="font-mono text-sm text-muted-foreground">{color.toUpperCase()}</span>
        </div>
      </Field>
      <ImagePicker id="logo" label="Logo" value={logo} onChange={setLogo} />
      <ImagePicker id="cover" label="Imagem de capa" value={cover} onChange={setCover} />
      <StepActions pending={pending} onBack={onBack} />
    </form>
  )
}

function HoursStep({
  draft,
  pending,
  onSubmit,
  onBack,
}: {
  draft: Draft | null
  pending: boolean
  onSubmit: (s: Saver) => void
  onBack: () => void
}) {
  const [hours, setHours] = useState<DaySchedule[]>(draft?.openingHours?.length === 7 ? draft.openingHours : DEFAULT_HOURS)
  const [interval, setInterval] = useState(draft?.slotIntervalMin ?? 15)
  const [advance, setAdvance] = useState(draft?.minAdvanceMin ?? 60)
  const [online, setOnline] = useState(draft?.onlineBookingEnabled ?? true)

  const update = (weekday: number, patch: Partial<DaySchedule>) =>
    setHours((h) => h.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)))

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(() => saveHoursStep({ openingHours: hours, slotIntervalMin: interval, minAdvanceMin: advance, onlineBookingEnabled: online }))
      }}
    >
      <div className="flex flex-col divide-y rounded-xl border">
        {hours.map((day) => (
          <div key={day.weekday} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
            <label className="flex w-32 items-center gap-3 text-sm font-medium">
              <Switch checked={day.active} onCheckedChange={(v) => update(day.weekday, { active: v })} />
              {WEEKDAY_LABELS[day.weekday]}
            </label>
            {day.active ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Input type="time" aria-label={`Abertura ${WEEKDAY_LABELS[day.weekday]}`} value={day.start} onChange={(e) => update(day.weekday, { start: e.target.value })} className="w-28" />
                <span className="text-muted-foreground">até</span>
                <Input type="time" aria-label={`Fechamento ${WEEKDAY_LABELS[day.weekday]}`} value={day.end} onChange={(e) => update(day.weekday, { end: e.target.value })} className="w-28" />
                <span className="text-muted-foreground">pausa</span>
                <Input type="time" aria-label={`Início da pausa ${WEEKDAY_LABELS[day.weekday]}`} value={day.breakStart ?? ""} onChange={(e) => update(day.weekday, { breakStart: e.target.value || null })} className="w-28" />
                <Input type="time" aria-label={`Fim da pausa ${WEEKDAY_LABELS[day.weekday]}`} value={day.breakEnd ?? ""} onChange={(e) => update(day.weekday, { breakEnd: e.target.value || null })} className="w-28" />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Fechado</span>
            )}
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="interval" label="Intervalo entre horários">
          <select id="interval" value={interval} onChange={(e) => setInterval(Number(e.target.value))} className={selectClass}>
            {[10, 15, 20, 30, 60].map((m) => (
              <option key={m} value={m} className="bg-popover">{m} minutos</option>
            ))}
          </select>
        </Field>
        <Field id="advance" label="Antecedência mínima">
          <select id="advance" value={advance} onChange={(e) => setAdvance(Number(e.target.value))} className={selectClass}>
            {[
              [0, "Sem antecedência"],
              [30, "30 minutos"],
              [60, "1 hora"],
              [120, "2 horas"],
              [240, "4 horas"],
              [1440, "1 dia"],
            ].map(([v, l]) => (
              <option key={v} value={v} className="bg-popover">{l}</option>
            ))}
          </select>
        </Field>
      </div>
      <label className="flex items-center justify-between gap-4 rounded-xl border p-4">
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Agendamento online</span>
          <span className="text-xs text-muted-foreground">Clientes podem marcar horários pela sua página pública.</span>
        </span>
        <Switch checked={online} onCheckedChange={setOnline} />
      </label>
      <StepActions pending={pending} onBack={onBack} />
    </form>
  )
}

function ServiceStep({ pending, onSubmit, onBack }: { pending: boolean; onSubmit: (s: Saver) => void; onBack: () => void }) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        onSubmit(() =>
          saveServiceStep({
            name: String(f.get("name") ?? ""),
            category: String(f.get("category") ?? ""),
            price: String(f.get("price") ?? ""),
            durationMin: Number(f.get("duration") ?? 0),
          })
        )
      }}
    >
      <p className="text-sm leading-relaxed text-muted-foreground">Cadastre seu primeiro serviço. Você poderá adicionar outros depois, no painel.</p>
      <Field id="svc-name" label="Nome do serviço">
        <Input id="svc-name" name="name" required placeholder="Corte masculino" />
      </Field>
      <Field id="svc-category" label="Categoria">
        <Input id="svc-category" name="category" placeholder="Cabelo" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="svc-price" label="Preço (R$)">
          <Input id="svc-price" name="price" inputMode="decimal" required placeholder="45,00" />
        </Field>
        <Field id="svc-duration" label="Duração (minutos)">
          <Input id="svc-duration" name="duration" type="number" min={5} max={600} step={5} required defaultValue={30} />
        </Field>
      </div>
      <StepActions pending={pending} onBack={onBack} />
    </form>
  )
}

function ProfessionalStep({
  services,
  pending,
  onSubmit,
  onBack,
}: {
  services: { id: string; name: string }[]
  pending: boolean
  onSubmit: (s: Saver) => void
  onBack: () => void
}) {
  const [mode, setMode] = useState<"self" | "other">("self")
  const [selected, setSelected] = useState<string[]>(services.map((s) => s.id))

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        onSubmit(() =>
          completeProfessionalStep({
            mode,
            name: String(f.get("name") ?? ""),
            phone: String(f.get("phone") ?? ""),
            email: String(f.get("email") ?? ""),
            serviceIds: selected,
          })
        )
      }}
    >
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Quem atende</legend>
        {(
          [
            ["self", "Eu mesmo atendo", "Sua agenda pessoal será criada."],
            ["other", "Outro profissional", "Cadastre quem vai atender."],
          ] as const
        ).map(([value, title, desc]) => (
          <label
            key={value}
            className={cn(
              "flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition-colors",
              mode === value ? "border-primary bg-primary/10" : "hover:bg-muted/40"
            )}
          >
            <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
            <span className="text-sm font-medium">{title}</span>
            <span className="text-xs text-muted-foreground">{desc}</span>
          </label>
        ))}
      </fieldset>
      {mode === "other" && (
        <div className="flex flex-col gap-4">
          <Field id="pro-name" label="Nome do profissional">
            <Input id="pro-name" name="name" required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="pro-phone" label="WhatsApp (opcional)">
              <Input id="pro-phone" name="phone" type="tel" />
            </Field>
            <Field id="pro-email" label="E-mail (opcional)">
              <Input id="pro-email" name="email" type="email" />
            </Field>
          </div>
        </div>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Serviços realizados</legend>
        {services.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum serviço cadastrado. Volte e cadastre um serviço.</p>
        ) : (
          services.map((s) => (
            <label key={s.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={selected.includes(s.id)}
                onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((id) => id !== s.id)))}
              />
              {s.name}
            </label>
          ))
        )}
      </fieldset>
      <StepActions pending={pending} onBack={onBack} label="Concluir e abrir o painel" />
    </form>
  )
}
