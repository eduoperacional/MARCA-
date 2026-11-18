"use client"

import { useEffect, useState } from "react"
import { useSWRConfig } from "swr"
import { BellRing, Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { enablePush, getPermission, getPushSupport, registerServiceWorker, resyncSubscription } from "@/lib/push/client"

const DISMISS_KEY = "marcai:push-prompt-dismissed-at"
const DISMISS_DAYS = 14
const PROMPT_DELAY_MS = 4000

/**
 * Registra o service worker, atualiza o sino quando chega um push e, uma vez, convida o usuário a ativar
 * os avisos no celular. A permissão do navegador só é pedida quando ele toca em "Ativar".
 */
export function PushBridge({ publicKey }: { publicKey: string | null }) {
  const { mutate } = useSWRConfig()
  const [showPrompt, setShowPrompt] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (getPushSupport() !== "supported") return
    void registerServiceWorker().then(() => resyncSubscription())

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "marcai:push") void mutate("/api/notifications")
    }
    navigator.serviceWorker.addEventListener("message", onMessage)

    let timer: ReturnType<typeof setTimeout> | undefined
    if (publicKey && getPermission() === "default") {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
      if (Date.now() - dismissedAt > DISMISS_DAYS * 86_400_000) {
        timer = setTimeout(() => setShowPrompt(true), PROMPT_DELAY_MS)
      }
    }
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage)
      if (timer) clearTimeout(timer)
    }
  }, [mutate, publicKey])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setShowPrompt(false)
  }

  async function activate() {
    if (!publicKey) return
    setPending(true)
    const result = await enablePush(publicKey)
    setPending(false)
    setShowPrompt(false)
    if (result.ok) {
      toast.success("Pronto! Você vai receber os avisos de agenda neste dispositivo.")
      return
    }
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    if (result.reason === "denied") toast.error("As notificações foram bloqueadas. Você pode liberá-las em Configurações > Notificações.")
    else if (result.reason === "failed") toast.error("Não foi possível ativar agora. Tente de novo em Configurações > Notificações.")
  }

  if (!showPrompt) return null

  return (
    <div
      role="dialog"
      aria-labelledby="push-prompt-title"
      aria-describedby="push-prompt-desc"
      className="fixed inset-x-3 bottom-3 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96"
    >
      <div className="flex gap-3 rounded-2xl border border-primary/30 bg-card/95 p-4 shadow-lg shadow-black/20 backdrop-blur">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-brand-light">
          <BellRing className="size-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p id="push-prompt-title" className="font-heading text-sm font-semibold">
              Saiba na hora de cada novo agendamento
            </p>
            <p id="push-prompt-desc" className="text-xs leading-relaxed text-muted-foreground">
              Receba avisos de novos horários, cancelamentos e lembretes no celular, mesmo com o MARCAÍ fechado.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={activate} disabled={pending}>
              {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
              Ativar avisos
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Agora não
            </Button>
          </div>
        </div>
        <Button size="icon-sm" variant="ghost" className="-mt-1 -mr-1" onClick={dismiss} aria-label="Fechar">
          <X />
        </Button>
      </div>
    </div>
  )
}
