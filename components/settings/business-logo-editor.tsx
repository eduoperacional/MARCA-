"use client"

/* eslint-disable @next/next/no-img-element -- User-owned Blob URLs have a runtime-defined host. */

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Cropper from "react-easy-crop"
import { ImagePlus, Loader2, Pencil, Store, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const MAX_SOURCE_BYTES = 20 * 1024 * 1024
const MAX_PREVIEW_BYTES = 2_500_000
const OUTPUT_SIZES = [1200, 960, 768, 640, 512]
const SVG_ELEMENTS = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "defs",
  "linearGradient", "radialGradient", "stop", "clipPath", "mask", "use", "text", "tspan", "title", "desc",
])
const SVG_ATTRIBUTES = new Set([
  "xmlns", "viewBox", "width", "height", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "fill-rule", "clip-rule", "opacity", "fill-opacity", "stroke-opacity", "cx", "cy", "r", "rx", "ry", "x", "y",
  "x1", "x2", "y1", "y2", "d", "points", "transform", "id", "offset", "stop-color", "stop-opacity",
  "gradientUnits", "gradientTransform", "spreadMethod", "href",
])

type CropArea = { x: number; y: number; width: number; height: number }

function sanitizeSvg(source: string) {
  const document = new DOMParser().parseFromString(source, "image/svg+xml")
  const root = document.documentElement
  if (root.localName !== "svg" || document.querySelector("parsererror")) throw new Error("O arquivo SVG não é válido.")
  root.setAttribute("xmlns", "http://www.w3.org/2000/svg")

  for (const element of Array.from(root.querySelectorAll("*"))) {
    if (!root.contains(element)) continue
    if (!SVG_ELEMENTS.has(element.localName)) {
      element.remove()
      continue
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name
      const value = attribute.value.trim()
      const isLocalReference = /^url\(\s*#[\w.-]+\s*\)$/i.test(value)
      if (
        !SVG_ATTRIBUTES.has(name) ||
        name.toLowerCase().startsWith("on") ||
        (name === "href" && !value.startsWith("#")) ||
        (/url\s*\(/i.test(value) && !isLocalReference) ||
        /javascript:|data:/i.test(value)
      ) {
        element.removeAttribute(name)
      }
    }
  }

  return new XMLSerializer().serializeToString(root)
}

async function previewSource(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase()
  const isSvg = file.type === "image/svg+xml" || extension === "svg"
  const isHeic = /heic|heif/i.test(file.type) || extension === "heic" || extension === "heif"

  if (isSvg) {
    const sanitized = sanitizeSvg(await file.text())
    return URL.createObjectURL(new Blob([sanitized], { type: "image/svg+xml" }))
  }

  if (isHeic) {
    const convert = (await import("heic2any")).default
    const converted = await convert({ blob: file, toType: "image/png" })
    const imageBlob = Array.isArray(converted) ? converted[0] : converted
    return URL.createObjectURL(imageBlob)
  }

  if (["image/jpeg", "image/png", "image/webp"].includes(file.type) || ["jpg", "jpeg", "png", "webp"].includes(extension ?? "")) {
    return URL.createObjectURL(file)
  }

  throw new Error("Escolha uma imagem JPEG, PNG, WebP, SVG ou HEIC.")
}

async function makeCroppedImage(source: string, area: CropArea) {
  const image = new Image()
  image.crossOrigin = "anonymous"
  image.src = source
  await image.decode()

  for (const size of OUTPUT_SIZES) {
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Não foi possível preparar a imagem neste navegador.")
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = "high"
    context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, size, size)

    for (const quality of [0.84, 0.72, 0.6]) {
      const output = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob)
          else reject(new Error("Não foi possível gerar a imagem recortada."))
        }, "image/webp", quality)
      })
      if (output.type !== "image/webp") throw new Error("Este navegador não consegue exportar a imagem em WebP.")
      if (output.size <= MAX_PREVIEW_BYTES) return output
    }
  }

  throw new Error("A imagem ainda ficou muito grande após a otimização. Tente um recorte mais simples.")
}

export function BusinessLogoEditor({
  initialLogoUrl,
  businessName,
}: {
  initialLogoUrl: string | null
  businessName: string
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const sourceUrlRef = useRef<string | null>(null)
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [minZoom, setMinZoom] = useState(0.1)
  const [cropArea, setCropArea] = useState<CropArea | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
  }, [])

  function clearSource() {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
    sourceUrlRef.current = null
    setSourceUrl(null)
    setCropArea(null)
  }

  async function selectImage(file: File) {
    setError(null)
    if (file.size > MAX_SOURCE_BYTES) {
      setError("O arquivo de origem precisa ter até 20 MB. As dimensões serão ajustadas automaticamente.")
      return
    }
    try {
      const nextSourceUrl = await previewSource(file)
      clearSource()
      sourceUrlRef.current = nextSourceUrl
      setSourceUrl(nextSourceUrl)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setMinZoom(0.1)
      setCropOpen(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir esta imagem.")
    }
  }

  async function uploadLogo() {
    if (!sourceUrl || !cropArea) {
      setError("Ajuste o recorte antes de continuar.")
      return
    }

    setBusy(true)
    setError(null)
    try {
      const image = await makeCroppedImage(sourceUrl, cropArea)
      const formData = new FormData()
      formData.append("file", image, "logomarca.webp")
      const response = await fetch("/api/business-profile/logo", { method: "POST", body: formData })
      const result = (await response.json().catch(() => ({}))) as { logoUrl?: string; error?: string }
      if (!response.ok || !result.logoUrl) throw new Error(result.error || "Não foi possível enviar a logomarca.")
      setLogoUrl(result.logoUrl)
      setCropOpen(false)
      clearSource()
      toast.success("Logomarca atualizada")
      router.refresh()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível enviar a logomarca."
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  async function removeLogo() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/business-profile/logo", { method: "DELETE" })
      const result = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(result.error || "Não foi possível remover a logomarca.")
      setLogoUrl(null)
      setRemoveOpen(false)
      toast.success("Logomarca removida")
      router.refresh()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível remover a logomarca."
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4" aria-labelledby="business-logo-heading">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background">
          {logoUrl ? (
            <img src={logoUrl} alt={`Logomarca de ${businessName}`} className="size-full object-contain" />
          ) : (
            <Store className="size-8 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 id="business-logo-heading" className="text-sm font-medium">Logomarca</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Aparece no perfil público e na prévia dos links. Arquivos grandes são recortados e otimizados antes do envio.
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/svg+xml,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.svg,.heic,.heif"
              className="sr-only"
              aria-label="Selecionar imagem da logomarca"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ""
                if (file) void selectImage(file)
              }}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
              {logoUrl ? <Pencil data-icon="inline-start" /> : <ImagePlus data-icon="inline-start" />}
              {logoUrl ? "Trocar logomarca" : "Adicionar logomarca"}
            </Button>
            {logoUrl && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setRemoveOpen(true)} disabled={busy}>
                <Trash2 data-icon="inline-start" />
                Remover
              </Button>
            )}
          </div>
        </div>
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <Dialog
        open={cropOpen}
        onOpenChange={(open) => {
          setCropOpen(open)
          if (!open && !busy) clearSource()
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajustar logomarca</DialogTitle>
            <DialogDescription>Arraste para reposicionar e use o controle para ajustar o enquadramento. A prévia mantém o fundo transparente.</DialogDescription>
          </DialogHeader>
          {sourceUrl && (
            <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-muted/40">
              <Cropper
                key={sourceUrl}
                image={sourceUrl}
                crop={crop}
                zoom={zoom}
                minZoom={minZoom}
                maxZoom={4}
                aspect={1}
                objectFit="contain"
                restrictPosition={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, area) => setCropArea(area)}
                onMediaLoaded={(media) => {
                  const ratio = media.naturalWidth / media.naturalHeight
                  const fit = Math.max(0.05, Math.min(1, ratio, 1 / ratio))
                  setMinZoom(fit)
                  setZoom(fit)
                }}
                classes={{ cropAreaClassName: "border-2 border-primary" }}
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label htmlFor="business-logo-zoom" className="text-sm font-medium">Zoom</label>
            <input
              id="business-logo-zoom"
              type="range"
              min={minZoom}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-full accent-primary"
              aria-valuetext={`${Math.round(zoom * 100)}%`}
            />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCropOpen(false)} disabled={busy}>Cancelar</Button>
            <Button type="button" onClick={uploadLogo} disabled={busy || !cropArea}>
              {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
              {busy ? "Enviando…" : "Salvar logomarca"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeOpen} onOpenChange={(open) => {
        if (!busy) setRemoveOpen(open)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover logomarca?</DialogTitle>
            <DialogDescription>A imagem deixará de aparecer no perfil público e nos links compartilhados.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoveOpen(false)} disabled={busy}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={removeLogo} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Trash2 data-icon="inline-start" />}
              {busy ? "Removendo…" : "Remover logomarca"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
