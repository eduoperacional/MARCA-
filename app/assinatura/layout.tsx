import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ArrowLeft } from "lucide-react"

import { MarcaiMark, MarcaiWordmark } from "@/components/brand/marcai-logo"
import { requireAccess } from "@/lib/business"

export const metadata: Metadata = {
  title: { default: "Assinatura", template: "%s · MARCAÍ" },
  robots: { index: false, follow: false },
}

export default function BillingLayout({ children }: LayoutProps<"/assinatura">) {
  return (
    <Suspense fallback={<div aria-hidden className="min-h-svh bg-background" />}>
      <BillingShell>{children}</BillingShell>
    </Suspense>
  )
}

async function BillingShell({ children }: { children: React.ReactNode }) {
  const access = await requireAccess()
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 md:px-6">
          <Link href="/assinatura" className="flex items-center gap-2.5" aria-label="Assinatura MARCAÍ">
            <MarcaiMark />
            <MarcaiWordmark className="text-base" />
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {access.business.displayName || access.business.name}
            </span>
            <Link
              href="/painel"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft aria-hidden className="size-4" />
              Voltar ao painel
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 md:px-6">{children}</main>
    </div>
  )
}
