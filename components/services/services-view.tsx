"use client"

import { useState } from "react"
import { Clock, Pencil, Plus, Scissors } from "lucide-react"

import { saveService, setServiceActive } from "@/app/actions/catalog"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useServerAction } from "@/hooks/use-server-action"
import { useUrlParams } from "@/hooks/use-url-params"
import { formatCurrency } from "@/lib/format"
import type { ProfessionalItem, ServiceItem } from "@/lib/queries/catalog"
import { cn } from "@/lib/utils"

export function ServicesView({
  services,
  professionals,
  openCreate,
}: {
  services: ServiceItem[]
  professionals: ProfessionalItem[]
  openCreate: boolean
}) {
  const [editing, setEditing] = useState<ServiceItem | "new" | null>(openCreate ? "new" : null)
  const { setParams } = useUrlParams()
  const categories = [...new Set(services.map((s) => s.category))].sort((a, b) => a.localeCompare(b, "pt-BR"))
  const professionalNames = new Map(professionals.map((p) => [p.id, p.name]))

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Serviços"
        description="Catálogo com preço, duração e profissionais habilitados."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus data-icon="inline-start" />
            Novo serviço
          </Button>
        }
      />

      {services.length === 0 ? (
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Scissors />
            </EmptyMedia>
            <EmptyTitle>Nenhum serviço cadastrado</EmptyTitle>
            <EmptyDescription>Cadastre os serviços que seu negócio oferece.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        categories.map((category) => (
          <Card key={category} className="gap-0 py-0">
            <CardHeader className="border-b py-3">
              <CardTitle className="font-heading text-base">{category}</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <ul className="divide-y">
                {services
                  .filter((s) => s.category === category)
                  .map((s) => (
                    <ServiceRow
                      key={s.id}
                      service={s}
                      professionalNames={s.professionalIds.map((id) => professionalNames.get(id)).filter(Boolean) as string[]}
                      onEdit={() => setEditing(s)}
                    />
                  ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null)
            if (openCreate) setParams({ novo: null }, { replace: true })
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {editing !== null && (
            <ServiceForm
              service={editing === "new" ? null : editing}
              professionals={professionals}
              categories={categories}
              onClose={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ServiceRow({ service: s, professionalNames, onEdit }: { service: ServiceItem; professionalNames: string[]; onEdit: () => void }) {
  const { pending, run } = useServerAction()
  return (
    <li className={cn("flex items-center gap-4 px-4 py-3", !s.active && "opacity-60")}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{s.name}</span>
        {s.description && <span className="truncate text-sm text-muted-foreground">{s.description}</span>}
        <span className="truncate text-xs text-muted-foreground">
          {professionalNames.length ? professionalNames.join(", ") : "Nenhum profissional habilitado"}
        </span>
      </div>
      <span className="hidden items-center gap-1 text-sm text-muted-foreground tabular-nums sm:flex">
        <Clock className="size-3.5" aria-hidden="true" />
        {s.durationMin} min
      </span>
      <span className="w-24 text-right font-medium tabular-nums">{formatCurrency(s.price, true)}</span>
      <Switch
        checked={s.active}
        disabled={pending}
        aria-label={s.active ? `Desativar ${s.name}` : `Ativar ${s.name}`}
        onCheckedChange={(active) => run(() => setServiceActive(s.id, active), active ? "Serviço ativado." : "Serviço desativado.")}
      />
      <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Editar ${s.name}`}>
        <Pencil />
      </Button>
    </li>
  )
}

function ServiceForm({
  service,
  professionals,
  categories,
  onClose,
}: {
  service: ServiceItem | null
  professionals: ProfessionalItem[]
  categories: string[]
  onClose: () => void
}) {
  const [name, setName] = useState(service?.name ?? "")
  const [category, setCategory] = useState(service?.category ?? categories[0] ?? "")
  const [description, setDescription] = useState(service?.description ?? "")
  const [price, setPrice] = useState(service ? String(service.price) : "")
  const [duration, setDuration] = useState(service ? String(service.durationMin) : "30")
  const [active, setActive] = useState(service?.active ?? true)
  const [professionalIds, setProfessionalIds] = useState<string[]>(
    service?.professionalIds ?? professionals.filter((p) => p.active).map((p) => p.id)
  )
  const { pending, run } = useServerAction()

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        run(
          () =>
            saveService({
              id: service?.id,
              name,
              category,
              description,
              price: Number(price.replace(",", ".")),
              durationMin: Number(duration),
              active,
              professionalIds,
            }),
          service ? "Serviço atualizado." : "Serviço cadastrado.",
          onClose
        )
      }}
    >
      <DialogHeader>
        <DialogTitle>{service ? "Editar serviço" : "Novo serviço"}</DialogTitle>
        <DialogDescription>A duração é usada para calcular os horários livres na agenda.</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="svc-name">Nome</FieldLabel>
          <Input id="svc-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="svc-category">Categoria</FieldLabel>
          <Input id="svc-category" list="svc-categories" value={category} onChange={(e) => setCategory(e.target.value)} required />
          <datalist id="svc-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="svc-price">Preço (R$)</FieldLabel>
            <Input id="svc-price" inputMode="decimal" placeholder="0,00" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="svc-duration">Duração (min)</FieldLabel>
            <Input id="svc-duration" type="number" min={5} max={600} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} required />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="svc-description">Descrição</FieldLabel>
          <Textarea id="svc-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <FieldSet>
          <FieldLegend variant="label">Profissionais habilitados</FieldLegend>
          <div className="grid gap-2 sm:grid-cols-2">
            {professionals.map((p) => {
              const id = `svc-pro-${p.id}`
              return (
                <label key={p.id} htmlFor={id} className="flex items-center gap-2 rounded-md border p-2.5 text-sm">
                  <Checkbox
                    id={id}
                    checked={professionalIds.includes(p.id)}
                    onCheckedChange={(checked) =>
                      setProfessionalIds((prev) => (checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)))
                    }
                  />
                  <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} aria-hidden="true" />
                  <span className="truncate">{p.name}</span>
                </label>
              )
            })}
          </div>
        </FieldSet>
        <Field orientation="horizontal">
          <Switch id="svc-active" checked={active} onCheckedChange={setActive} />
          <FieldLabel htmlFor="svc-active">Ativo (disponível para agendamento)</FieldLabel>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          Salvar
        </Button>
      </DialogFooter>
    </form>
  )
}
