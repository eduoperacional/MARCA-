"use client"

import { useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import type { BillingFormState } from "@/app/actions/billing"
import { cn } from "@/lib/utils"

export function BillingForm({
  action,
  hidden = {},
  submitLabel,
  pendingLabel = "Processando...",
  variant = "default",
  confirm,
  children,
  className,
}: {
  action: (state: BillingFormState, form: FormData) => Promise<BillingFormState>
  hidden?: Record<string, string>
  submitLabel: string
  pendingLabel?: string
  variant?: "default" | "destructive" | "outline"
  confirm?: string
  children?: React.ReactNode
  className?: string
}) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault()
      }}
      className={cn("flex flex-col gap-4", className)}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={variant} disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        {state && (
          <p role="status" className={cn("text-sm", state.ok ? "text-success" : "text-destructive")}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  )
}

/** Recarrega os dados do servidor periodicamente enquanto aguarda a confirmação do webhook. */
export function AutoRefresh({ seconds = 6 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), seconds * 1000)
    return () => window.clearInterval(id)
  }, [router, seconds])
  return null
}

export function CopyButton({ value, label = "Copiar código" }: { value: string; label?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={(event) => {
        const button = event.currentTarget
        navigator.clipboard.writeText(value).then(() => {
          button.textContent = "Copiado"
          window.setTimeout(() => (button.textContent = label), 2000)
        })
      }}
    >
      {label}
    </Button>
  )
}
