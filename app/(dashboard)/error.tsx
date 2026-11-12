"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Não foi possível carregar esta página</h1>
        <p className="text-sm text-muted-foreground">
          Houve uma falha ao buscar os dados. Verifique a conexão com o banco de dados e tente novamente.
        </p>
      </div>
      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">Código do erro: {error.digest}</p>
      ) : null}
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  )
}
