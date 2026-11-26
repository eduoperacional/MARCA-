import Link from "next/link"
import { ShieldCheck } from "lucide-react"

import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export const DETAILS_FORM_ID = "booking-details-form"

export function DetailsStep({
  businessName,
  name,
  phone,
  notes,
  error,
  onNameChange,
  onPhoneChange,
  onNotesChange,
  onSubmit,
}: {
  businessName: string
  name: string
  phone: string
  notes: string
  error: string | null
  onNameChange: (v: string) => void
  onPhoneChange: (v: string) => void
  onNotesChange: (v: string) => void
  onSubmit: () => void
}) {
  return (
    <section aria-labelledby="step-details-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="step-details-title" className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
          Seus dados
        </h2>
        <p className="text-sm text-muted-foreground">Usaremos seu WhatsApp apenas para informações sobre este horário.</p>
      </div>
      <form
        id={DETAILS_FORM_ID}
        className="flex flex-col gap-5 rounded-2xl border border-white/[0.07] bg-card p-4 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <FieldGroup>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="booking-name">Seu nome</FieldLabel>
              <Input id="booking-name" autoComplete="name" className="h-11" value={name} onChange={(e) => onNameChange(e.target.value)} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="booking-phone">WhatsApp</FieldLabel>
              <Input
                id="booking-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(11) 99999-9999"
                className="h-11"
                value={phone}
                onChange={(e) => onPhoneChange(e.target.value)}
                required
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="booking-notes">Observações (opcional)</FieldLabel>
            <Textarea
              id="booking-notes"
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              aria-describedby="booking-notes-hint"
            />
            <p id="booking-notes-hint" className="text-xs leading-relaxed text-muted-foreground">
              Escreva apenas o necessário para o atendimento. Não inclua informações de saúde, documentos ou outros dados sensíveis.
            </p>
          </Field>
        </FieldGroup>
        {error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </form>
      <p className="flex gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-light" aria-hidden="true" />
        <span>
          Seus dados são usados para realizar este agendamento. <strong className="font-medium text-foreground">{businessName}</strong> é
          responsável por eles, e a MARCAÍ os processa para prestar o serviço de agendamento. Seu nome, o serviço e os dados do horário
          podem ser enviados ao WhatsApp e às notificações do estabelecimento. Saiba mais na{" "}
          <Link href="/privacidade" target="_blank" className="font-medium text-brand-light underline-offset-4 hover:underline">
            Política de Privacidade
          </Link>
          .
        </span>
      </p>
    </section>
  )
}
