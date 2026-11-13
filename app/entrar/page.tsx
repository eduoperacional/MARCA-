import type { Metadata } from "next"
import Link from "next/link"

import { AuthShell, FormAlert } from "@/components/auth/auth-shell"
import { LoginForm } from "@/components/auth/login-form"

export const metadata: Metadata = { title: "Entrar" }

export default async function LoginPage({ searchParams }: PageProps<"/entrar">) {
  const params = await searchParams
  const redirect = typeof params.redirect === "string" ? params.redirect : undefined
  const resetDone = params.senha === "redefinida"
  const signupHref = redirect ? `/cadastro?redirect=${encodeURIComponent(redirect)}` : "/cadastro"

  return (
    <AuthShell
      title="Entrar na MARCAÍ"
      description="Acesse sua agenda, seus clientes e a gestão do seu negócio."
      footer={
        <>
          Ainda não tem conta?{" "}
          <Link href={signupHref} className="font-medium text-brand-light hover:underline">
            Criar conta grátis
          </Link>
        </>
      }
    >
      <FormAlert tone="success" message={resetDone ? "Senha redefinida. Entre com a nova senha." : null} />
      <LoginForm redirectTo={redirect} />
    </AuthShell>
  )
}
