import { AuthShell } from "@/components/auth/auth-shell"

export function AuthLoading() {
  return (
    <AuthShell title="Carregando" description="Só um instante...">
      <div aria-hidden className="flex flex-col gap-3">
        <div className="h-11 w-full animate-pulse rounded-md bg-muted" />
        <div className="h-11 w-full animate-pulse rounded-md bg-muted" />
      </div>
    </AuthShell>
  )
}
