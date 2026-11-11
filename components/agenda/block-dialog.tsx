"use client"

import { useState } from "react"

import { createTimeBlock } from "@/app/actions/operations"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useServerAction } from "@/hooks/use-server-action"
import type { ProfessionalItem } from "@/lib/queries/catalog"

const ALL = "all"

export function BlockDialog({
  open,
  onOpenChange,
  professionals,
  defaultDate,
  defaultProfessionalId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  professionals: ProfessionalItem[]
  defaultDate: string
  defaultProfessionalId?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <BlockForm
            onClose={() => onOpenChange(false)}
            professionals={professionals}
            defaultDate={defaultDate}
            defaultProfessionalId={defaultProfessionalId}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function BlockForm({
  onClose,
  professionals,
  defaultDate,
  defaultProfessionalId,
}: {
  onClose: () => void
  professionals: ProfessionalItem[]
  defaultDate: string
  defaultProfessionalId?: string
}) {
  const [professionalId, setProfessionalId] = useState(defaultProfessionalId || ALL)
  const [date, setDate] = useState(defaultDate)
  const [start, setStart] = useState("12:00")
  const [end, setEnd] = useState("13:00")
  const [reason, setReason] = useState("")
  const { pending, run } = useServerAction()
  const items = [{ value: ALL, label: "Toda a equipe" }, ...professionals.map((p) => ({ value: p.id, label: p.name }))]

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        run(
          () => createTimeBlock({ professionalId: professionalId === ALL ? null : professionalId, date, start, end, reason }),
          "Horário bloqueado.",
          onClose
        )
      }}
    >
      <DialogHeader>
        <DialogTitle>Bloquear horário</DialogTitle>
        <DialogDescription>O período ficará indisponível na agenda e na página de agendamento.</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel>Profissional</FieldLabel>
          <Select items={items} value={professionalId} onValueChange={(v) => setProfessionalId(v ?? ALL)}>
            <SelectTrigger className="w-full" aria-label="Profissional">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {items.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="block-date">Data</FieldLabel>
          <Input id="block-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="block-start">Início</FieldLabel>
            <Input id="block-start" type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="block-end">Fim</FieldLabel>
            <Input id="block-end" type="time" step={300} value={end} onChange={(e) => setEnd(e.target.value)} required />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="block-reason">Motivo</FieldLabel>
          <Input id="block-reason" placeholder="Ex.: almoço, compromisso, folga" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          Bloquear
        </Button>
      </DialogFooter>
    </form>
  )
}
