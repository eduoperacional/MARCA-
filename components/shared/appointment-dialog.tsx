"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Loader2 } from "lucide-react"

import { saveAppointment } from "@/app/actions/appointments"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useServerAction } from "@/hooks/use-server-action"
import { formatCurrency } from "@/lib/format"
import type { FormOptions } from "@/lib/queries/options"
import { todayLocal } from "@/lib/time"
import type { Appointment } from "@/lib/types"
import { cn } from "@/lib/utils"

const fetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : { slots: [] })) as Promise<{ slots: string[] }>

export interface AppointmentDefaults {
  date?: string
  start?: string
  professionalId?: string
  clientId?: string
}

interface AppointmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: FormOptions
  appointment?: Appointment | null
  defaults?: AppointmentDefaults
}

export function AppointmentDialog(props: AppointmentDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        {props.open && <AppointmentForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function AppointmentForm({ onOpenChange, options, appointment, defaults }: AppointmentDialogProps) {
  const isEdit = Boolean(appointment)
  const activeServices = options.services.filter((s) => s.active || s.id === appointment?.service.id)

  const [clientMode, setClientMode] = useState<"existing" | "new">("existing")
  const [clientId, setClientId] = useState(appointment?.clientId ?? defaults?.clientId ?? "")
  const [clientSearch, setClientSearch] = useState("")
  const [newName, setNewName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [serviceId, setServiceId] = useState(appointment?.service.id ?? "")
  const [professionalId, setProfessionalId] = useState(appointment?.professional.id ?? defaults?.professionalId ?? "")
  const [date, setDate] = useState(appointment?.date ?? defaults?.date ?? todayLocal())
  const [start, setStart] = useState(appointment?.start ?? defaults?.start ?? "")
  const [notes, setNotes] = useState(appointment?.notes ?? "")
  const [price, setPrice] = useState(appointment ? String(appointment.price) : "")
  const { pending, run } = useServerAction()

  const service = options.services.find((s) => s.id === serviceId)
  const eligibleProfessionals = options.professionals.filter(
    (p) => (p.active && (!service || p.serviceIds.includes(service.id))) || p.id === appointment?.professional.id
  )

  const slotsKey =
    serviceId && professionalId && date
      ? `/api/slots?serviceId=${serviceId}&professionalId=${professionalId}&date=${date}${appointment ? `&exclude=${appointment.id}` : ""}`
      : null
  const { data, isLoading } = useSWR(slotsKey, fetcher, { revalidateOnFocus: false })
  const slots = data?.slots ?? []

  const filteredClients = useMemo(() => {
    const term = clientSearch.trim().toLowerCase()
    const digits = term.replace(/\D/g, "")
    const list = term
      ? options.clients.filter(
          (c) => c.name.toLowerCase().includes(term) || (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits))
        )
      : options.clients
    return list.slice(0, 6)
  }, [clientSearch, options.clients])
  const selectedClient = options.clients.find((c) => c.id === clientId)

  const serviceItems = activeServices.map((s) => ({ value: s.id, label: s.name }))
  const professionalItems = eligibleProfessionals.map((p) => ({ value: p.id, label: p.name }))

  function handleServiceChange(value: string | null) {
    const next = value ?? ""
    setServiceId(next)
    const nextService = options.services.find((s) => s.id === next)
    if (!isEdit && nextService) setPrice(String(nextService.price))
    if (nextService && professionalId) {
      const prof = options.professionals.find((p) => p.id === professionalId)
      if (prof && !prof.serviceIds.includes(next)) setProfessionalId("")
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    run(
      () =>
        saveAppointment({
          id: appointment?.id,
          clientId: isEdit || clientMode === "existing" ? clientId || null : null,
          newClient: !isEdit && clientMode === "new" ? { name: newName, phone: newPhone } : null,
          serviceId,
          professionalId,
          date,
          start,
          notes,
          price: price === "" ? null : Number(price.replace(",", ".")),
        }),
      isEdit ? "Agendamento atualizado." : "Agendamento criado.",
      () => onOpenChange(false)
    )
  }

  const canSubmit =
    serviceId &&
    professionalId &&
    date &&
    /^\d{2}:\d{2}$/.test(start) &&
    (isEdit || clientMode === "new" ? (isEdit ? clientId : newName && newPhone) : clientId)

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
        <DialogDescription>
          {isEdit ? "Altere serviço, profissional, data ou horário." : "Escolha cliente, serviço e um horário livre."}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        {isEdit ? (
          <Field>
            <FieldLabel>Cliente</FieldLabel>
            <p className="text-sm font-medium">{appointment?.clientName}</p>
          </Field>
        ) : (
          <Field>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="client-search">Cliente</FieldLabel>
              <Tabs value={clientMode} onValueChange={(v) => setClientMode(v as "existing" | "new")}>
                <TabsList className="h-8">
                  <TabsTrigger value="existing" className="text-xs">Existente</TabsTrigger>
                  <TabsTrigger value="new" className="text-xs">Novo cliente</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {clientMode === "existing" ? (
              <div className="flex flex-col gap-2">
                <Input
                  id="client-search"
                  placeholder="Buscar por nome ou telefone"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  autoComplete="off"
                />
                <div role="listbox" aria-label="Clientes" className="flex flex-col gap-1">
                  {filteredClients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={c.id === clientId}
                      onClick={() => setClientId(c.id)}
                      className={cn(
                        "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                        c.id === clientId && "border-primary bg-primary/10"
                      )}
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.phone}</span>
                    </button>
                  ))}
                  {filteredClients.length === 0 && (
                    <p className="px-1 text-sm text-muted-foreground">
                      Nenhum cliente encontrado. Use a aba “Novo cliente”.
                    </p>
                  )}
                </div>
                {selectedClient && !filteredClients.some((c) => c.id === clientId) && (
                  <FieldDescription>Selecionado: {selectedClient.name}</FieldDescription>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input aria-label="Nome do cliente" placeholder="Nome completo" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Input
                  aria-label="Telefone do cliente"
                  placeholder="(11) 99999-9999"
                  inputMode="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>
            )}
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Serviço</FieldLabel>
            <Select items={serviceItems} value={serviceId || null} onValueChange={handleServiceChange}>
              <SelectTrigger className="w-full" aria-label="Serviço">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {activeServices.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {s.durationMin} min
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Profissional</FieldLabel>
            <Select items={professionalItems} value={professionalId || null} onValueChange={(v) => setProfessionalId(v ?? "")}>
              <SelectTrigger className="w-full" aria-label="Profissional">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {eligibleProfessionals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="appt-date">Data</FieldLabel>
            <Input id="appt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="appt-price">Valor (R$)</FieldLabel>
            <Input
              id="appt-price"
              inputMode="decimal"
              placeholder={service ? String(service.price) : "0,00"}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="appt-start">Horário</FieldLabel>
          {!slotsKey ? (
            <FieldDescription>Selecione serviço, profissional e data para ver os horários livres.</FieldDescription>
          ) : isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Carregando horários…
            </p>
          ) : slots.length === 0 ? (
            <FieldDescription>Nenhum horário livre nesta data. Você pode informar um horário manualmente.</FieldDescription>
          ) : (
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6" role="group" aria-label="Horários livres">
              {slots.map((slot) => (
                <Button
                  key={slot}
                  type="button"
                  size="sm"
                  variant={slot === start ? "default" : "outline"}
                  aria-pressed={slot === start}
                  onClick={() => setStart(slot)}
                  className="tabular-nums"
                >
                  {slot}
                </Button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input id="appt-start" type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} className="w-32" />
            {service && <span className="text-xs text-muted-foreground">Duração de {service.durationMin} min · {formatCurrency(service.price)}</span>}
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor="appt-notes">Observações</FieldLabel>
          <Textarea id="appt-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!canSubmit || pending}>
          {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
          {isEdit ? "Salvar alterações" : "Agendar"}
        </Button>
      </DialogFooter>
    </form>
  )
}
