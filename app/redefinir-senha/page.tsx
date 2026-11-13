import type { Metadata } from "next"

import { AuthShell } from "@/components/auth/auth-shell"
import { ResetPasswordForm } from "@/components/auth/password-forms"

export const metadata: Metadata = { title: "Redefinir senha" }

export default async function ResetPasswordPage({ searchParams }: PageProps<"/redefinir-senha">) {
  const params = await searchParams
  const token = typeof params.token === "string" ? params.token : null
  const invalid = params.error === "INVALID_TOKEN"

  return (
    <AuthShell title="Criar nova senha" description="Escolha uma senha forte, com pelo menos 8 caracteres, letras e números.">
      <ResetPasswordForm token={token} invalid={invalid} />
    </AuthShell>
  )
}
