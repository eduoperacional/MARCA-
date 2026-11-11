"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { saveClient } from "@/app/actions/catalog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useServerAction } from "@/hooks/use-server-action"

export interface ClientFormValues {
  id?: string
  name: string
  phone: string
  email: string | null
  birthDate: string | null
  notes: string | null
}

export function ClientDialog({
  open,
  onOpenChange,
  client,
  openAfterCreate = true,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  client?: ClientFormValues | null
  openAfterCreate?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && <ClientForm client={client} onClose={() => onOpenChange(false)} openAfterCreate={openAfterCreate} />}
      </DialogContent>
    </Dialog>
  )
}

function ClientForm({
  client,
  onClose,
  openAfterCreate,
}: {
  client?: ClientFormValues | null
  onClose: () => void
  openAfterCreate: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState(client?.name ?? "")
  const [phone, setPhone] = useState(client?.phone ?? "")
  const [email, setEmail] = useState(client?.email ?? "")
  const [birthDate, setBirthDate] = useState(client?.birthDate ?? "")
  const [notes, setNotes] = useState(client?.notes ?? "")
  const { pending, run } = useServerAction()

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        run(
          () => saveClient({ id: client?.id, name, phone, email, birthDate, notes }),
          client ? "Cliente atualizado." : "Cliente cadastrado.",
          (result) => {
            onClose()
            if (!client && openAfterCreate && "id" in result && result.id) router.push(`/clientes/${result.id}`)
          }
        )
      }}
    >
      <DialogHeader>
        <DialogTitle>{client ? "Editar cliente" : "Novo cliente"}</DialogTitle>
        <DialogDescription>O telefone é usado para identificar o cliente e evitar cadastros duplicados.</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="client-name">Nome</FieldLabel>
          <Input id="client-name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="client-phone">Telefone</FieldLabel>
            <Input id="client-phone" inputMode="tel" placeholder="(11) 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="client-birth">Data de nascimento</FieldLabel>
            <Input id="client-birth" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="client-email">E-mail</FieldLabel>
          <Input id="client-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Opcional" />
        </Field>
        <Field>
          <FieldLabel htmlFor="client-notes">Observações</FieldLabel>
          <Textarea id="client-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Preferências, alergias, histórico…" />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !name.trim() || !phone.trim()}>
          Salvar
        </Button>
      </DialogFooter>
    </form>
  )
}
