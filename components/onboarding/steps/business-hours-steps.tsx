"use client"

import { useState } from "react"

import { saveBusinessStep, saveHoursStep } from "@/app/actions/onboarding"
import { WhatsappPhoneInput } from "@/components/shared/whatsapp-phone-input"
import { Input } from "@/components/ui/input"
import { Field, ImagePicker, StepActions, StepGuide, WeekScheduleEditor, selectClass, type Saver } from "@/components/onboarding/wizard-ui"
import type { WizardBusiness } from "@/components/onboarding/types"
import { BRAZIL_STATES, BUSINESS_SEGMENTS } from "@/lib/onboarding"
import type { DaySchedule } from "@/lib/types"

interface StepProps {
  business: WizardBusiness | null
  pending: boolean
  onSubmit: (save: Saver) => void
  onBack?: () => void
}

export function BusinessStep({ business, pending, onSubmit, createNew, mode }: StepProps & { createNew: boolean; mode: "guided" | "manual" }) {
  const [color, setColor] = useState(business?.primaryColor ?? "#7B3FF2")
  const [logo, setLogo] = useState(business?.logoUrl ?? null)

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
            displayName: get("displayName"),
            primaryColor: color,
            logoUrl: logo,
            notificationPhone: get("notificationPhone"),
            createNew,
            mode,
          })
        )
      }}
    >
      <StepGuide topic="business" />
      <Field id="name" label="Nome comercial">
        <Input id="name" name="name" required minLength={2} maxLength={80} defaultValue={business?.name} placeholder="Barbearia do Centro" />
      </Field>
      <Field id="segment" label="Tipo de negócio">
        <select id="segment" name="segment" required defaultValue={business?.segment ?? ""} className={selectClass}>
          <option value="" disabled className="bg-popover">Selecione</option>
          {BUSINESS_SEGMENTS.map((s) => (
            <option key={s.value} value={s.value} className="bg-popover">{s.label}</option>
          ))}
        </select>
      </Field>
      <Field id="phone" label="Telefone / WhatsApp do estabelecimento" hint="Com DDD. Ex.: (11) 98888-7777">
        <Input id="phone" name="phone" type="tel" required defaultValue={business?.phone} placeholder="(11) 98888-7777" />
      </Field>
      <Field
        id="notificationPhone"
        label="WhatsApp para receber notificações"
        hint="Opcional. Você recebe avisos de novos agendamentos, cancelamentos e reagendamentos. Pode alterar depois em Configurações."
      >
        <WhatsappPhoneInput id="notificationPhone" name="notificationPhone" />
      </Field>
      <Field id="address" label="Endereço">
        <Input id="address" name="address" required maxLength={200} defaultValue={business?.address} placeholder="Rua, número, bairro" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field id="city" label="Cidade">
          <Input id="city" name="city" required maxLength={80} defaultValue={business?.city} />
        </Field>
        <Field id="state" label="Estado">
          <select id="state" name="state" required defaultValue={business?.state ?? ""} className={selectClass}>
            <option value="" disabled className="bg-popover">UF</option>
            {BRAZIL_STATES.map((uf) => (
              <option key={uf} value={uf} className="bg-popover">{uf}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="displayName" label="Nome de exibição na página pública" hint="Opcional. Se vazio, usamos o nome comercial.">
        <Input id="displayName" name="displayName" maxLength={80} defaultValue={business?.displayName ?? ""} />
      </Field>
      <Field id="color" label="Cor principal">
        <div className="flex items-center gap-3">
          <input id="color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 cursor-pointer rounded-md border bg-transparent" />
          <span className="font-mono text-sm text-muted-foreground">{color.toUpperCase()}</span>
        </div>
      </Field>
      <ImagePicker id="logo" label="Logo" value={logo} onChange={setLogo} />
      <StepActions pending={pending} label={mode === "manual" && createNew ? "Salvar e ir para o painel" : "Salvar e continuar"} />
    </form>
  )
}

export function HoursStep({ business, pending, onSubmit, onBack }: StepProps) {
  const [hours, setHours] = useState<DaySchedule[]>(business?.openingHours ?? [])
  const hasOpenDay = hours.some((d) => d.active)
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(() => saveHoursStep({ openingHours: hours }))
      }}
    >
      <StepGuide topic="hours" />
      <WeekScheduleEditor label="Horários de funcionamento" value={hours} onChange={setHours} />
      {!hasOpenDay && <p className="text-sm text-destructive">Ative ao menos um dia de atendimento.</p>}
      <StepActions pending={pending} onBack={onBack} disabled={!hasOpenDay} />
    </form>
  )
}
