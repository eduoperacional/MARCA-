import { createHash } from "node:crypto"

import { and, eq, gt, isNull } from "drizzle-orm"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { AcceptInviteButton } from "@/components/auth/accept-invite-button"
import { AuthShell, FormAlert } from "@/components/auth/auth-shell"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/business"
import { db } from "@/lib/db"
import { businesses, invitations } from "@/lib/db/schema"
import { ROLE_LABELS } from "@/lib/permissions"

export const metadata: Metadata = { title: "Convite para a equipe", robots: { index: false } }

export default function InvitePage({ params }: PageProps<"/convite/[token]">) {
  return (
    <Suspense
      fallback={
        <AuthShell title="Carregando convite" description="Verificando os dados do convite...">
          <div className="h-11 w-full animate-pulse rounded-md bg-muted" />
        </AuthShell>
      }
    >
      <InviteContent params={params} />
    </Suspense>
  )
}

async function InviteContent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const valid = token.length >= 20 && token.length <= 100
  const [invite] = valid
    ? await db
        .select({ email: invitations.email, role: invitations.role, businessName: businesses.name })
        .from(invitations)
        .innerJoin(businesses, eq(businesses.id, invitations.businessId))
        .where(
          and(
            eq(invitations.tokenHash, createHash("sha256").update(token).digest("hex")),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            gt(invitations.expiresAt, new Date())
          )
        )
        .limit(1)
    : []

  if (!invite) {
    return (
      <AuthShell title="Convite indisponível" description="Este convite é inválido, expirou ou já foi utilizado.">
        <p className="text-sm leading-relaxed text-muted-foreground">Peça ao responsável pelo estabelecimento para enviar um novo convite.</p>
        <Button render={<Link href="/" />} nativeButton={false} variant="outline">
          Ir para o início
        </Button>
      </AuthShell>
    )
  }

  const session = await getSession()
  const redirect = encodeURIComponent(`/convite/${token}`)
  const wrongAccount = session?.user && session.user.email.toLowerCase() !== invite.email

  return (
    <AuthShell
      title={`Junte-se a ${invite.businessName}`}
      description={`Você foi convidado como ${ROLE_LABELS[invite.role]}. O convite foi enviado para ${invite.email}.`}
    >
      {!session?.user ? (
        <div className="flex flex-col gap-3">
          <Button size="lg" render={<Link href={`/cadastro?redirect=${redirect}`} />} nativeButton={false}>
            Criar conta e aceitar
          </Button>
          <Button size="lg" variant="outline" render={<Link href={`/entrar?redirect=${redirect}`} />} nativeButton={false}>
            Já tenho conta
          </Button>
        </div>
      ) : wrongAccount ? (
        <FormAlert message={`Você está conectado como ${session.user.email}. Saia e entre com ${invite.email} para aceitar.`} />
      ) : (
        <AcceptInviteButton token={token} />
      )}
    </AuthShell>
  )
}
