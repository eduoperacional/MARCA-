"use client"

import { useState } from "react"

import { saveProfessional } from "@/app/actions/catalog"
import { defaultSchedule, ScheduleEditor } from "@/components/shared/schedule-editor"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { useServerAction } from "@/hooks/use-server-action"
import type { ProfessionalItem, ServiceItem } from "@/lib/queries/catalog"
import { cn } from "@/lib/utils"

const COLORS = ["#8b5cf6", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#ec4899", "#6366f1", "#14b8a6"]

export function ProfessionalSheet({
  open,
  onOpenChange,
  professional,
  services,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  professional: ProfessionalItem | null
  services: ServiceItem[]
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-2xl">
        {open && (
          <ProfessionalForm
            key={professional?.id ?? "new"}
            professional={professional}
            services={services}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function ProfessionalForm({
  professional,
  services,
  onClose,
}: {
  professional: ProfessionalItem | null
  services: ServiceItem[]
  onClose: () => void
}) {
  const [name, setName] = useState(professional?.name ?? "")
  const [phone, setPhone] = useState(professional?.phone ?? "")
  const [email, setEmail] = useState(professional?.email ?? "")
  const [photoUrl, setPhotoUrl] = useState(professional?.photoUrl ?? "")
  const [specialties, setSpecialties] = useState(professional?.specialties ?? "")
  const [color, setColor] = useState(professional?.color ?? COLORS[0])
  const [active, setActive] = useState(professional?.active ?? true)
  const [schedule, setSchedule] = useState(professional?.workSchedule ?? defaultSchedule())
  const [serviceIds, setServiceIds] = useState<string[]>(professional?.serviceIds ?? services.filter((s) => s.active).map((s) => s.id))
  const { pending, run } = useServerAction()

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        run(
          () =>
            saveProfessional({
              id: professional?.id,
              name,
              phone,
              email,
              photoUrl,
              specialties,
              color,
              active,
              workSchedule: schedule,
              serviceIds,
            }),
          professional ? "Profissional atualizado." : "Profissional cadastrado.",
          onClose
        )
      }}
    >
      <SheetHeader className="border-b">
        <SheetTitle>{professional ? "Editar profissional" : "Novo profissional"}</SheetTitle>
        <SheetDescription>A jornada define os horários disponíveis na agenda e na página pública.</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="pro-name">Nome</FieldLabel>
              <Input id="pro-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="pro-specialties">Especialidades</FieldLabel>
              <Input id="pro-specialties" placeholder="Ex.: Cortes clássicos, barba" value={specialties} onChange={(e) => setSpecialties(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="pro-phone">Telefone</FieldLabel>
              <Input id="pro-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="pro-email">E-mail</FieldLabel>
              <Input id="pro-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="pro-photo">Foto (link da imagem)</FieldLabel>
            <Input id="pro-photo" type="url" placeholder="https://…" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />
          </Field>
          <FieldSet>
            <FieldLegend variant="label">Cor na agenda</FieldLegend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor na agenda">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "size-7 rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    color === c && "ring-2 ring-foreground"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </FieldSet>
          <Field orientation="horizontal">
            <Switch id="pro-active" checked={active} onCheckedChange={setActive} />
            <FieldLabel htmlFor="pro-active">Ativo (recebe agendamentos)</FieldLabel>
          </Field>
        </FieldGroup>

        <FieldSet>
          <FieldLegend variant="label">Jornada de trabalho</FieldLegend>
          <ScheduleEditor value={schedule} onChange={setSchedule} idPrefix="pro-schedule" />
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Serviços que realiza</FieldLegend>
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => {
              const id = `pro-service-${s.id}`
              return (
                <label key={s.id} htmlFor={id} className="flex items-center gap-2 rounded-md border p-2.5 text-sm has-[[data-checked]]:border-primary/60">
                  <Checkbox
                    id={id}
                    checked={serviceIds.includes(s.id)}
                    onCheckedChange={(checked) =>
                      setServiceIds((prev) => (checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)))
                    }
                  />
                  <span className="flex-1 truncate">{s.name}</span>
                  {!s.active && <span className="text-xs text-muted-foreground">inativo</span>}
                </label>
              )
            })}
          </div>
        </FieldSet>
      </div>

      <SheetFooter className="flex-row justify-end border-t">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          Salvar
        </Button>
      </SheetFooter>
    </form>
  )
}
