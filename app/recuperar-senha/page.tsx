import type { Metadata } from "next"
import Link from "next/link"

import { AuthShell } from "@/components/auth/auth-shell"
import { ForgotPasswordForm } from "@/components/auth/password-forms"
import { isEmailConfigured } from "@/lib/email"

export const metadata: Metadata = { title: "Recuperar senha" }

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Recuperar senha"
      description="Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha."
      footer={
        <Link href="/entrar" className="font-medium text-brand-light hover:underline">
          Voltar para o login
        </Link>
      }
    >
      <ForgotPasswordForm emailEnabled={isEmailConfigured()} />
    </AuthShell>
  )
}
