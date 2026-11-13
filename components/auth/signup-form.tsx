"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { FormAlert, safeRedirect } from "@/components/auth/auth-shell"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signUp } from "@/lib/auth-client"

type Errors = Partial<Record<"name" | "email" | "phone" | "password" | "confirm" | "terms", string>>

export function SignupForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [terms, setTerms] = useState(false)

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get("name") ?? "").trim()
    const email = String(form.get("email") ?? "").trim().toLowerCase()
    const phone = String(form.get("phone") ?? "").trim()
    const password = String(form.get("password") ?? "")
    const confirm = String(form.get("confirm") ?? "")

    const next: Errors = {}
    if (name.length < 2) next.name = "Informe seu nome completo."
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) next.email = "Informe um e-mail válido."
    const digits = phone.replace(/\D/g, "")
    if (digits.length < 10 || digits.length > 13) next.phone = "Informe um WhatsApp com DDD."
    if (password.length < 8) next.password = "A senha precisa ter pelo menos 8 caracteres."
    else if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) next.password = "Use letras e números na senha."
    if (confirm !== password) next.confirm = "As senhas não coincidem."
    if (!terms) next.terms = "Você precisa aceitar os termos para continuar."
    setErrors(next)
    if (Object.keys(next).length) return

    setError(null)
    startTransition(async () => {
      const { data, error } = await signUp.email({ name, email, password, phone })
      if (error) {
        if (error.status === 429) setError("Muitas tentativas. Aguarde um minuto.")
        else if (error.code === "USER_ALREADY_EXISTS" || error.status === 422) setError("Já existe uma conta com este e-mail. Entre ou recupere a senha.")
        else setError("Não foi possível criar sua conta. Tente novamente.")
        return
      }
      if (!data?.token) {
        setNotice("Conta criada. Enviamos um link de confirmação para o seu e-mail.")
        return
      }
      router.replace(safeRedirect(redirectTo, "/onboarding"))
      router.refresh()
    })
  }

  if (notice) return <FormAlert message={notice} tone="success" />

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormAlert message={error} />
      <TextField id="name" label="Nome completo" autoComplete="name" error={errors.name} />
      <TextField id="email" label="E-mail" type="email" autoComplete="email" error={errors.email} />
      <TextField id="phone" label="WhatsApp" type="tel" autoComplete="tel" placeholder="(11) 99999-9999" error={errors.phone} />
      <TextField id="password" label="Senha" type="password" autoComplete="new-password" error={errors.password} hint="Mínimo de 8 caracteres, com letras e números." />
      <TextField id="confirm" label="Confirmar senha" type="password" autoComplete="new-password" error={errors.confirm} />
      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <Checkbox className="mt-0.5" checked={terms} onCheckedChange={(v) => setTerms(Boolean(v))} aria-invalid={Boolean(errors.terms)} />
          <span>Li e aceito os Termos de Uso e a Política de Privacidade da MARCAÍ.</span>
        </label>
        {errors.terms && <p className="text-xs text-destructive">{errors.terms}</p>}
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Criando conta..." : "Criar conta"}
      </Button>
    </form>
  )
}

function TextField({
  id,
  label,
  error,
  hint,
  ...props
}: React.ComponentProps<typeof Input> & { id: string; label: string; error?: string; hint?: string }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} aria-invalid={Boolean(error)} aria-describedby={describedBy} {...props} />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
