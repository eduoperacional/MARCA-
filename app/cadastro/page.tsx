import type { Metadata } from "next"
import Link from "next/link"

import { AuthShell } from "@/components/auth/auth-shell"
import { SignupForm } from "@/components/auth/signup-form"

export const metadata: Metadata = { title: "Criar conta" }

export default async function SignupPage({ searchParams }: PageProps<"/cadastro">) {
  const params = await searchParams
  const redirect = typeof params.redirect === "string" ? params.redirect : undefined
  const loginHref = redirect ? `/entrar?redirect=${encodeURIComponent(redirect)}` : "/entrar"

  return (
    <AuthShell
      title="Crie sua conta"
      description="Em poucos minutos seu estabelecimento estará pronto para receber agendamentos online."
      footer={
        <>
          Já tem uma conta?{" "}
          <Link href={loginHref} className="font-medium text-brand-light hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <SignupForm redirectTo={redirect} />
    </AuthShell>
  )
}
