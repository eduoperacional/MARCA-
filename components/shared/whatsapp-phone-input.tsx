"use client"

import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { maskBrazilPhone } from "@/lib/whatsapp/templates"

export function WhatsappPhoneInput({
  id,
  name,
  value,
  onChange,
  defaultValue,
  ...props
}: {
  id: string
  name?: string
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  "aria-describedby"?: string
  "aria-invalid"?: boolean
}) {
  return (
    <InputGroup>
      <InputGroupAddon>
        <InputGroupText className="font-mono">+55</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        name={name}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="(11) 98888-7777"
        maxLength={15}
        {...(value !== undefined
          ? { value: maskBrazilPhone(value) }
          : { defaultValue: defaultValue ? maskBrazilPhone(defaultValue) : undefined })}
        onChange={(e) => {
          const masked = maskBrazilPhone(e.target.value)
          if (value === undefined) e.target.value = masked
          onChange?.(masked)
        }}
        {...props}
      />
    </InputGroup>
  )
}
