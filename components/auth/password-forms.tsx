"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { FormAlert } from "@/components/auth/auth-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"

export function ForgotPasswordForm({ emailEnabled }: { emailEnabled: boolean }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setError("Informe um e-mail válido.")
      return
    }
    setError(null)
    startTransition(async () => {
      const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/redefinir-senha" })
      if (error?.status === 429) {
        setError("Muitas solicitações. Aguarde alguns minutos.")
        return
      }
      setSent(true)
    })
  }

  if (sent) {
    return (
      <FormAlert
        tone="success"
        message="Se houver uma conta com este e-mail, você receberá um link para redefinir a senha em alguns minutos."
      />
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {!emailEnabled && (
        <FormAlert message="O envio de e-mails ainda não está configurado neste ambiente. O link de redefinição será registrado apenas nos logs do servidor." />
      )}
      <FormAlert message={error} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail da conta</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Enviando..." : "Enviar link de redefinição"}
      </Button>
    </form>
  )
}

export function ResetPasswordForm({ token, invalid }: { token: string | null; invalid: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (invalid || !token) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert message="Este link é inválido ou expirou. Solicite um novo link de redefinição." />
        <Button render={<Link href="/recuperar-senha" />} nativeButton={false}>Solicitar novo link</Button>
      </div>
    )
  }

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get("password") ?? "")
    const confirm = String(form.get("confirm") ?? "")
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      setError("Use pelo menos 8 caracteres, com letras e números.")
      return
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.")
      return
    }
    setError(null)
    startTransition(async () => {
      const { error } = await authClient.resetPassword({ newPassword: password, token })
      if (error) {
        setError(error.status === 429 ? "Muitas tentativas. Aguarde alguns minutos." : "Este link é inválido ou expirou. Solicite um novo.")
        return
      }
      router.replace("/entrar?senha=redefinida")
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <FormAlert message={error} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Nova senha</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirmar nova senha</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Salvando..." : "Redefinir senha"}
      </Button>
    </form>
  )
}
