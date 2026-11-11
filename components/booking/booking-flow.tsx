"use client"

import { useMemo, useState, useTransition } from "react"
import useSWR from "swr"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowLeft, CalendarCheck2, Check, Clock, Loader2, Users } from "lucide-react"

import { createPublicBooking } from "@/app/actions/public-booking"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency, getInitials } from "@/lib/format"
import { addDays, dateFromLocal, weekdayOf } from "@/lib/time"
import { cn } from "@/lib/utils"

interface PublicService {
  id: string
  name: string
  category: string
  description: string | null
  price: number
  durationMin: number
  professionalIds: string[]
}

interface PublicProfessional {
  id: string
  name: string
  specialties: string | null
  photoUrl: string | null
  color: string
  workdays: number[]
}

type Step = "service" | "professional" | "time" | "details" | "done"
const STEPS: { key: Exclude<Step, "done">; label: string }[] = [
  { key: "service", label: "Serviço" },
  { key: "professional", label: "Profissional" },
  { key: "time", label: "Horário" },
  { key: "details", label: "Seus dados" },
]

const slotsFetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error("Falha ao carregar horários")
  return (await res.json()) as { slots: string[] }
}

export function BookingFlow({
  slug,
  today,
  openWeekdays,
  services,
  professionals,
}: {
  slug: string
  today: string
  openWeekdays: number[]
  services: PublicService[]
  professionals: PublicProfessional[]
}) {
  const [step, setStep] = useState<Step>("service")
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [professionalId, setProfessionalId] = useState<string | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [confirmedWith, setConfirmedWith] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const service = services.find((s) => s.id === serviceId) ?? null
  const professional = professionals.find((p) => p.id === professionalId) ?? null
  const eligible = professionals.filter((p) => service?.professionalIds.includes(p.id))

  const days = useMemo(() => {
    const workdays = new Set((professional ? [professional] : eligible).flatMap((p) => p.workdays))
    return Array.from({ length: 21 }, (_, i) => addDays(today, i)).filter((d) => {
      const wd = weekdayOf(d)
      return openWeekdays.includes(wd) && workdays.has(wd)
    })
  }, [today, openWeekdays, professional, eligible])

  const slotsKey =
    step === "time" && service && date
      ? `/api/slots?${new URLSearchParams({ slug, serviceId: service.id, date, ...(professionalId ? { professionalId } : {}) })}`
      : null
  const { data: slotData, isLoading: loadingSlots, mutate: refreshSlots } = useSWR(slotsKey, slotsFetcher)

  const categories = [...new Set(services.map((s) => s.category))]
  const stepIndex = STEPS.findIndex((s) => s.key === step)

  function back() {
    setError(null)
    if (step === "professional") setStep("service")
    if (step === "time") setStep("professional")
    if (step === "details") setStep("time")
  }

  function submit() {
    if (!service || !date || !time) return
    setError(null)
    startTransition(async () => {
      const result = await createPublicBooking({ slug, serviceId: service.id, professionalId, date, start: time, name, phone, notes })
      if (!result.ok) {
        setError(result.error)
        if (result.error.includes("ocupado")) {
          setTime(null)
          setStep("time")
          refreshSlots()
        }
        return
      }
      const data = (result as { data?: { professionalName?: string } }).data
      setConfirmedWith(data?.professionalName || professional?.name || null)
      setStep("done")
    })
  }

  if (step === "done" && service && date && time) {
    return (
      <section className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center" aria-live="polite">
        <span className="flex size-14 items-center justify-center rounded-full bg-success/15 text-success">
          <CalendarCheck2 className="size-7" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-xl font-semibold">Agendamento recebido!</h2>
          <p className="text-sm text-muted-foreground">Guarde os detalhes do seu horário:</p>
        </div>
        <dl className="grid w-full max-w-sm grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg bg-muted/50 p-4 text-left text-sm">
          <dt className="text-muted-foreground">Serviço</dt>
          <dd className="font-medium">{service.name}</dd>
          <dt className="text-muted-foreground">Profissional</dt>
          <dd className="font-medium">{confirmedWith ?? "A definir"}</dd>
          <dt className="text-muted-foreground">Data</dt>
          <dd className="font-medium capitalize">{format(dateFromLocal(date), "EEEE, dd 'de' MMMM", { locale: ptBR })}</dd>
          <dt className="text-muted-foreground">Horário</dt>
          <dd className="font-medium">{time}</dd>
          <dt className="text-muted-foreground">Valor</dt>
          <dd className="font-medium">{formatCurrency(service.price, true)}</dd>
        </dl>
        <Button
          variant="outline"
          onClick={() => {
            setStep("service")
            setServiceId(null)
            setProfessionalId(null)
            setDate(null)
            setTime(null)
            setNotes("")
          }}
        >
          Fazer outro agendamento
        </Button>
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex items-center gap-2" aria-label="Etapas do agendamento">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex flex-1 flex-col gap-1.5" aria-current={i === stepIndex ? "step" : undefined}>
            <span className={cn("h-1 rounded-full bg-muted", i <= stepIndex && "bg-primary")} />
            <span className={cn("text-xs text-muted-foreground", i === stepIndex && "font-medium text-foreground")}>{s.label}</span>
          </li>
        ))}
      </ol>

      {step !== "service" && (
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={back} className="-ml-2">
            <ArrowLeft data-icon="inline-start" />
            Voltar
          </Button>
          {service && (
            <span className="truncate text-sm text-muted-foreground">
              {service.name}
              {step !== "professional" && ` · ${professional?.name ?? "Qualquer profissional"}`}
            </span>
          )}
        </div>
      )}

      {step === "service" && (
        <section className="flex flex-col gap-5">
          <h2 className="font-heading text-lg font-semibold">Escolha o serviço</h2>
          {categories.map((category) => (
            <div key={category} className="flex flex-col gap-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{category}</h3>
              <ul className="flex flex-col gap-2">
                {services
                  .filter((s) => s.category === category)
                  .map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setServiceId(s.id)
                          if (professionalId && !s.professionalIds.includes(professionalId)) setProfessionalId(null)
                          setTime(null)
                          setStep("professional")
                        }}
                        className={cn(
                          "flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left transition-colors outline-none hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring",
                          serviceId === s.id && "border-primary"
                        )}
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="font-medium">{s.name}</span>
                          {s.description && <span className="text-sm text-muted-foreground">{s.description}</span>}
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="size-3" aria-hidden="true" />
                            {s.durationMin} min
                          </span>
                        </span>
                        <span className="font-semibold tabular-nums">{formatCurrency(s.price, true)}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {step === "professional" && service && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold">Com quem você prefere?</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            <li>
              <ProfessionalOption
                selected={professionalId === null}
                onClick={() => {
                  setProfessionalId(null)
                  setDate(null)
                  setTime(null)
                  setStep("time")
                }}
                title="Qualquer profissional"
                subtitle="Mostra mais horários disponíveis"
                avatar={
                  <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-brand-light">
                    <Users className="size-5" aria-hidden="true" />
                  </span>
                }
              />
            </li>
            {eligible.map((p) => (
              <li key={p.id}>
                <ProfessionalOption
                  selected={professionalId === p.id}
                  onClick={() => {
                    setProfessionalId(p.id)
                    setDate(null)
                    setTime(null)
                    setStep("time")
                  }}
                  title={p.name}
                  subtitle={p.specialties ?? ""}
                  avatar={
                    <Avatar className="size-10">
                      {p.photoUrl && <AvatarImage src={p.photoUrl} alt="" />}
                      <AvatarFallback style={{ backgroundColor: `color-mix(in oklch, ${p.color} 30%, var(--card))` }}>
                        {getInitials(p.name)}
                      </AvatarFallback>
                    </Avatar>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {step === "time" && service && (
        <section className="flex flex-col gap-4">
          <h2 className="font-heading text-lg font-semibold">Escolha o dia e o horário</h2>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="listbox" aria-label="Dias disponíveis">
            {days.map((d) => {
              const dt = dateFromLocal(d)
              const selected = d === date
              return (
                <button
                  key={d}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    setDate(d)
                    setTime(null)
                  }}
                  className={cn(
                    "flex w-16 shrink-0 flex-col items-center gap-0.5 rounded-xl border bg-card py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected && "border-primary bg-primary text-primary-foreground"
                  )}
                >
                  <span className={cn("text-xs capitalize", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {format(dt, "EEE", { locale: ptBR }).replace(".", "")}
                  </span>
                  <span className="font-heading text-lg font-semibold tabular-nums">{format(dt, "dd")}</span>
                  <span className={cn("text-[11px] capitalize", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {format(dt, "MMM", { locale: ptBR }).replace(".", "")}
                  </span>
                </button>
              )
            })}
          </div>

          {!date ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Selecione um dia para ver os horários.</p>
          ) : loadingSlots ? (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Buscando horários livres…
            </div>
          ) : !slotData?.slots.length ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum horário livre neste dia. Tente outra data{professional ? " ou outro profissional" : ""}.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="listbox" aria-label="Horários disponíveis">
              {slotData.slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  role="option"
                  aria-selected={time === slot}
                  onClick={() => {
                    setTime(slot)
                    setError(null)
                    setStep("details")
                  }}
                  className={cn(
                    "rounded-lg border bg-card py-2 text-sm font-medium tabular-nums outline-none hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring",
                    time === slot && "border-primary bg-primary text-primary-foreground"
                  )}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </section>
      )}

      {step === "details" && service && date && time && (
        <section className="flex flex-col gap-5">
          <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-brand-light">
              <CalendarCheck2 className="size-5" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium capitalize">
                {format(dateFromLocal(date), "EEEE, dd 'de' MMMM", { locale: ptBR })} às {time}
              </span>
              <span className="truncate text-sm text-muted-foreground">
                {service.name} · {service.durationMin} min · {formatCurrency(service.price, true)}
              </span>
            </div>
          </div>
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="booking-name">Seu nome</FieldLabel>
                <Input id="booking-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="booking-phone">WhatsApp</FieldLabel>
                <Input
                  id="booking-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="booking-notes">Observações (opcional)</FieldLabel>
                <Textarea id="booking-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </FieldGroup>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" size="lg" disabled={pending || !name.trim() || !phone.trim()}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Check data-icon="inline-start" />}
              Confirmar agendamento
            </Button>
          </form>
        </section>
      )}
    </div>
  )
}

function ProfessionalOption({
  selected,
  onClick,
  title,
  subtitle,
  avatar,
}: {
  selected: boolean
  onClick: () => void
  title: string
  subtitle: string
  avatar: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left outline-none hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary"
      )}
    >
      {avatar}
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{title}</span>
        {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
    </button>
  )
}
