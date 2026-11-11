"use client"

import { useCallback } from "react"
import { toast } from "sonner"

import { currentBusiness } from "@/config/business"

export function useShareBookingLink() {
  return useCallback(async () => {
    const link = `${window.location.origin}/agendar/${currentBusiness.slug}`
    try {
      await navigator.clipboard.writeText(link)
      toast.success("Link de agendamento copiado", {
        description: `${link} — a página pública será ativada no módulo Página de agendamento.`,
      })
    } catch {
      toast.error("Não foi possível copiar o link", { description: link })
    }
  }, [])
}
