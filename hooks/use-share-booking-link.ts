"use client"

import { useCallback } from "react"
import { toast } from "sonner"

import { useWorkspace } from "@/components/layout/workspace-context"

export function useShareBookingLink(slugOverride?: string) {
  const { business } = useWorkspace()
  const slug = slugOverride ?? business.slug
  return useCallback(async () => {
    const link = `${window.location.origin}/agendar/${slug}`
    try {
      await navigator.clipboard.writeText(link)
      toast.success("Link de agendamento copiado", { description: link })
    } catch {
      toast.info("Seu link de agendamento", { description: link })
    }
  }, [slug])
}
