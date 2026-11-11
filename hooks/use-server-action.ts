"use client"

import { useTransition } from "react"
import { toast } from "sonner"

type Result = { ok: true } | { ok: false; error: string }

/** Executa uma server action exibindo toast de sucesso/erro. */
export function useServerAction() {
  const [pending, startTransition] = useTransition()

  function run<R extends Result>(action: () => Promise<R>, successMessage?: string, onSuccess?: (result: R) => void) {
    startTransition(async () => {
      try {
        const result = await action()
        if (!result.ok) {
          toast.error((result as { error: string }).error)
          return
        }
        if (successMessage) toast.success(successMessage)
        onSuccess?.(result)
      } catch {
        toast.error("Não foi possível concluir a ação. Tente novamente.")
      }
    })
  }

  return { pending, run }
}
