"use client"

import { useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

/** Atualiza parâmetros da URL preservando os demais (filtros server-side). */
export function useUrlParams() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  function setParams(params: Record<string, string | null | undefined>, { replace = false } = {}) {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined || value === "") next.delete(key)
      else next.set(key, value)
    }
    const query = next.toString()
    const url = query ? `${pathname}?${query}` : pathname
    startTransition(() => (replace ? router.replace(url, { scroll: false }) : router.push(url, { scroll: false })))
  }

  return { pending, setParams, searchParams }
}
