import Link from "next/link"

import { MarcaiMark, MarcaiWordmark } from "@/components/brand/marcai-logo"

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="bg-brand-glow flex min-h-svh flex-col items-center justify-center gap-8 px-4 py-10">
      <Link href="/" className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <MarcaiMark />
        <MarcaiWordmark />
      </Link>
      <main className="flex w-full max-w-md flex-col gap-6 rounded-2xl border bg-card/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-2xl font-semibold text-balance">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>
        </div>
        {children}
      </main>
      {footer && <div className="text-sm text-muted-foreground">{footer}</div>}
    </div>
  )
}

export function FormAlert({ message, tone = "error" }: { message: string | null; tone?: "error" | "success" }) {
  if (!message) return null
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          : "rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground"
      }
    >
      {message}
    </p>
  )
}

export function safeRedirect(value: string | null | undefined, fallback = "/painel") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback
  return value
}
