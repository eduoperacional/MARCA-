"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { acceptInvitation } from "@/app/actions/team"
import { FormAlert } from "@/components/auth/auth-shell"
import { Button } from "@/components/ui/button"

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <FormAlert message={error} />
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvitation(token)
            if (!result.ok) {
              setError(result.error)
              return
            }
            router.replace("/painel")
            router.refresh()
          })
        }
      >
        {pending ? "Entrando na equipe..." : "Aceitar convite"}
      </Button>
    </div>
  )
}
