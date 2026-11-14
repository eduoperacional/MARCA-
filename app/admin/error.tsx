"use client"

import { Button } from "@/components/ui/button"

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border bg-card/70 p-6">
      <h1 className="font-heading text-lg font-semibold">Não foi possível carregar esta área</h1>
      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
        Confira se o script <code className="font-mono">scripts/006-super-admin.sql</code> foi executado no banco de
        produção. Se o erro continuar, tente novamente em instantes.
      </p>
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  )
}
