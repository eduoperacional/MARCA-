"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import type { AdminFormState } from "@/app/actions/admin"
import { cn } from "@/lib/utils"

export const adminFieldClass =
  "w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

export function AdminActionForm({
  action,
  hidden,
  submitLabel,
  destructive,
  confirm,
  children,
  className,
}: {
  action: (state: AdminFormState, form: FormData) => Promise<AdminFormState>
  hidden: Record<string, string>
  submitLabel: string
  destructive?: boolean
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
      className={cn("flex flex-col gap-3", className)}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant={destructive ? "destructive" : "default"} disabled={pending}>
          {pending ? "Salvando..." : submitLabel}
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

export function AdminField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
