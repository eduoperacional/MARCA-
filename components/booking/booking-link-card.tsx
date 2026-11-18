"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, CircleAlert, Copy, ExternalLink, Link2, Loader2, MessageCircle, Pencil, X } from "lucide-react"
import { toast } from "sonner"

import { checkSlugAvailability, updateBookingSlug } from "@/app/actions/onboarding"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { bookingPath, bookingUrl, displayHost } from "@/lib/site-url"
import { slugify } from "@/lib/slug"

type Status =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; slug: string }
  | { state: "unavailable"; reason: string; suggestions: string[] }

export function BookingLinkCard({
  slug: initialSlug,
  siteUrl,
  businessName,
  onlineBookingEnabled,
  canEdit,
}: {
  slug: string
  siteUrl: string
  businessName: string
  onlineBookingEnabled: boolean
  canEdit: boolean
}) {
  const router = useRouter()
  const [slug, setSlug] = useState(initialSlug)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialSlug)
  const [status, setStatus] = useState<Status>({ state: "idle" })
  const [copied, setCopied] = useState(false)
  const [saving, startSaving] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestId = useRef(0)

  const url = bookingUrl(siteUrl, slug)
  const host = displayHost(siteUrl)
  const normalizedDraft = slugify(draft)
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`Agende seu horário em ${businessName}: ${url}`)}`

  function scheduleCheck(value: string) {
    if (timer.current) clearTimeout(timer.current)
    const normalized = slugify(value)
    if (!normalized || normalized === slug) {
      setStatus({ state: "idle" })
      return
    }
    setStatus({ state: "checking" })
    const id = ++requestId.current
    timer.current = setTimeout(async () => {
      try {
        const result = await checkSlugAvailability(normalized)
        if (id !== requestId.current) return
        setStatus(
          result.available
            ? { state: "available", slug: result.slug ?? normalized }
            : { state: "unavailable", reason: result.reason ?? "Indisponível.", suggestions: result.suggestions ?? [] }
        )
      } catch {
        if (id === requestId.current) setStatus({ state: "unavailable", reason: "Não foi possível verificar agora.", suggestions: [] })
      }
    }, 400)
  }

  function onDraftChange(value: string) {
    const cleaned = value.toLowerCase().replace(/\s+/g, "-")
    setDraft(cleaned)
    scheduleCheck(cleaned)
  }

  function pickSuggestion(value: string) {
    setDraft(value)
    scheduleCheck(value)
  }

  function cancel() {
    if (timer.current) clearTimeout(timer.current)
    requestId.current++
    setDraft(slug)
    setStatus({ state: "idle" })
    setEditing(false)
  }

  function save() {
    if (status.state !== "available") return
    startSaving(async () => {
      const result = await updateBookingSlug(normalizedDraft)
      if (!result.ok) {
        setStatus({ state: "unavailable", reason: result.error, suggestions: result.suggestions ?? [] })
        return
      }
      setSlug(result.slug)
      setDraft(result.slug)
      setStatus({ state: "idle" })
      setEditing(false)
      toast.success("Link atualizado", { description: "O endereço anterior continua levando para a sua página." })
      router.refresh()
    })
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success("Link copiado")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Não foi possível copiar o link.")
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary" aria-hidden="true">
            <Link2 className="size-4" />
          </span>
          <CardTitle>Link de agendamento</CardTitle>
          {onlineBookingEnabled ? (
            <Badge className="bg-success/15 text-success">Ativo</Badge>
          ) : (
            <Badge variant="secondary">Agendamento online desativado</Badge>
          )}
        </div>
        <CardDescription>
          Compartilhe este endereço com seus clientes. Eles escolhem serviço, profissional e horário sozinhos, 24h por dia.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-transparent to-transparent p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Seu endereço</p>
          <p className="break-all font-mono text-sm sm:text-base">
            <span className="text-muted-foreground">{host}/agendar/</span>
            <span className="font-semibold text-foreground">{slug}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={copy}>
              {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
              {copied ? "Copiado" : "Copiar link"}
            </Button>
            <Button variant="outline" render={<a href={whatsappHref} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
              <MessageCircle data-icon="inline-start" />
              WhatsApp
            </Button>
            <Button variant="outline" render={<a href={bookingPath(slug)} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
              <ExternalLink data-icon="inline-start" />
              Abrir página
            </Button>
            {canEdit && !editing && (
              <Button variant="ghost" onClick={() => setEditing(true)}>
                <Pencil data-icon="inline-start" />
                Personalizar
              </Button>
            )}
          </div>
        </div>

        {editing && (
          <form
            className="flex flex-col gap-3 rounded-xl border p-4"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <label htmlFor="booking-slug" className="text-sm font-medium">
              Endereço personalizado
            </label>
            <div className="flex items-center overflow-hidden rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring">
              <span className="hidden shrink-0 pl-3 text-sm text-muted-foreground sm:inline">{host}/agendar/</span>
              <span className="shrink-0 pl-3 text-sm text-muted-foreground sm:hidden">/agendar/</span>
              <input
                id="booking-slug"
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                maxLength={48}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby="booking-slug-status"
                aria-invalid={status.state === "unavailable"}
                className="h-10 min-w-0 flex-1 bg-transparent pr-3 font-mono text-sm outline-none"
              />
            </div>

            <div id="booking-slug-status" aria-live="polite" className="flex flex-col gap-2 text-sm">
              {status.state === "idle" && (
                <span className="text-muted-foreground">Use letras minúsculas, números e hífens. Acentos e espaços são ajustados automaticamente.</span>
              )}
              {status.state === "checking" && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  Verificando disponibilidade...
                </span>
              )}
              {status.state === "available" && (
                <span className="flex items-center gap-1.5 text-success">
                  <Check className="size-3.5" aria-hidden="true" />
                  Disponível: {host}/agendar/{status.slug}
                </span>
              )}
              {status.state === "unavailable" && (
                <>
                  <span className="flex items-center gap-1.5 text-destructive">
                    <CircleAlert className="size-3.5" aria-hidden="true" />
                    {status.reason}
                  </span>
                  {status.suggestions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Sugestões:</span>
                      {status.suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => pickSuggestion(s)}
                          className="rounded-full border px-2.5 py-1 font-mono text-xs transition-colors hover:border-primary hover:bg-primary/10"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Ao trocar, quem acessar o endereço antigo é levado automaticamente para o novo.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={status.state !== "available" || saving}>
                {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Check data-icon="inline-start" />}
                Salvar endereço
              </Button>
              <Button type="button" variant="ghost" onClick={cancel} disabled={saving}>
                <X data-icon="inline-start" />
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
