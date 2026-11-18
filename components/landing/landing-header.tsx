import Link from "next/link"
import { Suspense } from "react"

import { MarcaiMark, MarcaiWordmark } from "@/components/brand/marcai-logo"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/business"

const NAV = [
  { href: "#beneficios", label: "Benefícios" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#planos", label: "Planos" },
]

async function HeaderActions() {
  const session = await getSession().catch((error) => {
    console.error("[landing] Falha ao ler a sessão", error)
    return null
  })
  if (session?.user) {
    return (
      <Button render={<Link href="/painel" />} nativeButton={false}>
        Abrir painel
      </Button>
    )
  }
  return (
    <>
      <Button variant="ghost" render={<Link href="/entrar" />} nativeButton={false}>
        Entrar
      </Button>
      <Button render={<Link href="/cadastro" />} nativeButton={false} className="hidden sm:inline-flex">
        Começar grátis
      </Button>
    </>
  )
}

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0B0B12]/70 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3" aria-label="Principal">
        <Link href="/" className="flex items-center gap-2.5" aria-label="MARCAÍ, página inicial">
          <MarcaiMark />
          <MarcaiWordmark />
        </Link>
        <ul className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          {NAV.map((item) => (
            <li key={item.href}>
              <a href={item.href} className="transition-colors hover:text-foreground">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Suspense
            fallback={
              <Button variant="ghost" render={<Link href="/entrar" />} nativeButton={false}>
                Entrar
              </Button>
            }
          >
            <HeaderActions />
          </Suspense>
        </div>
      </nav>
    </header>
  )
}
