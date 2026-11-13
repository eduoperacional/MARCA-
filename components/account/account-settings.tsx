"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { savePreferences, type PreferencesInput } from "@/app/actions/account"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { authClient, signOut } from "@/lib/auth-client"

const authError = (status?: number, fallback = "Não foi possível salvar.") =>
  status === 429 ? "Muitas tentativas. Aguarde um minuto." : fallback

export function AccountSettings({
  profile,
  preferences,
  emailEnabled,
}: {
  profile: { name: string; email: string; phone: string }
  preferences: PreferencesInput
  emailEnabled: boolean
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ProfileCard profile={profile} />
      <EmailCard currentEmail={profile.email} emailEnabled={emailEnabled} />
      <PasswordCard />
      <PreferencesCard initial={preferences} />
    </div>
  )
}

function ProfileCard({ profile }: { profile: { name: string; phone: string } }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get("name") ?? "").trim()
    const phone = String(form.get("phone") ?? "").trim()
    if (name.length < 2) return void toast.error("Informe seu nome.")
    const digits = phone.replace(/\D/g, "")
    if (digits.length < 10 || digits.length > 13) return void toast.error("Informe um WhatsApp com DDD.")
    startTransition(async () => {
      const { error } = await authClient.updateUser({ name, phone })
      if (error) return void toast.error(authError(error.status))
      toast.success("Perfil atualizado.")
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perfil</CardTitle>
        <CardDescription>Como você aparece para a equipe.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-name">Nome completo</Label>
            <Input id="profile-name" name="name" defaultValue={profile.name} autoComplete="name" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-phone">WhatsApp</Label>
            <Input id="profile-phone" name="phone" type="tel" defaultValue={profile.phone} autoComplete="tel" />
          </div>
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Salvando..." : "Salvar perfil"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function EmailCard({ currentEmail, emailEnabled }: { currentEmail: string; emailEnabled: boolean }) {
  const [pending, startTransition] = useTransition()

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formEl = event.currentTarget
    const newEmail = String(new FormData(formEl).get("email") ?? "").trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newEmail)) return void toast.error("Informe um e-mail válido.")
    if (newEmail === currentEmail.toLowerCase()) return void toast.error("Este já é o seu e-mail.")
    startTransition(async () => {
      const { error } = await authClient.changeEmail({ newEmail, callbackURL: "/painel/minha-conta" })
      if (error) return void toast.error(authError(error.status, "Não foi possível alterar o e-mail. Ele pode já estar em uso."))
      formEl.reset()
      toast.success(emailEnabled ? "Enviamos um link de confirmação para o novo e-mail." : "E-mail atualizado.")
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>E-mail de acesso</CardTitle>
        <CardDescription>Atual: {currentEmail}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-email">Novo e-mail</Label>
            <Input id="new-email" name="email" type="email" autoComplete="email" />
          </div>
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Enviando..." : "Alterar e-mail"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function PasswordCard() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formEl = event.currentTarget
    const form = new FormData(formEl)
    const currentPassword = String(form.get("current") ?? "")
    const newPassword = String(form.get("next") ?? "")
    const confirm = String(form.get("confirm") ?? "")
    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return void toast.error("A nova senha precisa ter 8 caracteres, com letras e números.")
    }
    if (newPassword !== confirm) return void toast.error("As senhas não coincidem.")
    startTransition(async () => {
      const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
      if (error) return void toast.error(authError(error.status, "Senha atual incorreta."))
      formEl.reset()
      toast.success("Senha alterada. Os outros dispositivos foram desconectados.")
    })
  }

  const signOutEverywhere = () =>
    startTransition(async () => {
      await authClient.revokeSessions()
      await signOut()
      router.replace("/entrar")
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Segurança</CardTitle>
        <CardDescription>Altere sua senha ou encerre todas as sessões.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pw-current">Senha atual</Label>
            <Input id="pw-current" name="current" type="password" autoComplete="current-password" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pw-next">Nova senha</Label>
            <Input id="pw-next" name="next" type="password" autoComplete="new-password" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pw-confirm">Confirmar nova senha</Label>
            <Input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" />
          </div>
          <Button type="submit" disabled={pending} className="self-start">
            Alterar senha
          </Button>
        </form>
        <Button variant="outline" onClick={signOutEverywhere} disabled={pending} className="self-start">
          Sair de todos os dispositivos
        </Button>
      </CardContent>
    </Card>
  )
}

function PreferencesCard({ initial }: { initial: PreferencesInput }) {
  const [prefs, setPrefs] = useState(initial)
  const [pending, startTransition] = useTransition()

  const options: { key: keyof PreferencesInput; label: string; description: string }[] = [
    { key: "notifyNewBooking", label: "Novos agendamentos", description: "Avisar quando um cliente agendar online." },
    { key: "notifyCancellation", label: "Cancelamentos", description: "Avisar quando um horário for cancelado." },
    { key: "weeklySummary", label: "Resumo semanal", description: "Receber um resumo de atendimentos e faturamento." },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notificações</CardTitle>
        <CardDescription>Escolha o que você quer acompanhar.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {options.map((option) => (
          <label key={option.key} className="flex items-start justify-between gap-4">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">{option.description}</span>
            </span>
            <Switch checked={prefs[option.key]} onCheckedChange={(v) => setPrefs((p) => ({ ...p, [option.key]: v }))} />
          </label>
        ))}
        <Button
          className="self-start"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await savePreferences(prefs)
              if (!result.ok) toast.error(result.error)
              else toast.success("Preferências salvas.")
            })
          }
        >
          {pending ? "Salvando..." : "Salvar preferências"}
        </Button>
      </CardContent>
    </Card>
  )
}
