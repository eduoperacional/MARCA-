"use client"

import Image from "next/image"
import { useRef } from "react"
import type { PointerEvent } from "react"
import { BellRing, CalendarCheck, TrendingUp, Users } from "lucide-react"

import { HeroPhone } from "@/components/landing/hero-phone"

const PARTICLES = [
  { top: "12%", left: "18%", size: 4, delay: "0s" },
  { top: "22%", left: "84%", size: 3, delay: "-2s" },
  { top: "64%", left: "8%", size: 3, delay: "-4s" },
  { top: "78%", left: "88%", size: 5, delay: "-1s" },
  { top: "40%", left: "94%", size: 2, delay: "-3s" },
  { top: "6%", left: "56%", size: 2, delay: "-5s" },
]

export function HeroVisual() {
  const sceneRef = useRef<HTMLDivElement>(null)

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return
    const scene = sceneRef.current
    if (!scene) return
    const rect = scene.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5
    const y = (event.clientY - rect.top) / rect.height - 0.5
    scene.style.setProperty("--px", x.toFixed(3))
    scene.style.setProperty("--py", y.toFixed(3))
  }

  function handlePointerLeave() {
    sceneRef.current?.style.setProperty("--px", "0")
    sceneRef.current?.style.setProperty("--py", "0")
  }

  return (
    <div
      ref={sceneRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="hero-scene relative mx-auto aspect-square w-full max-w-[34rem]"
      role="img"
      aria-label="Smartphone exibindo a agenda do MARCAÍ, cercado por cartões de agendamento confirmado, lembrete automático, equipe e faturamento"
    >
      <div className="hero-layer-back absolute inset-0" aria-hidden>
        <Image
          src="/images/hero-stage.png"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 544px, 92vw"
          className="object-contain [mask-image:radial-gradient(circle_at_50%_50%,#000_52%,transparent_72%)]"
        />
        <div className="animate-glow absolute left-1/2 top-1/2 size-2/3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(123_63_242/0.35),transparent_65%)] blur-2xl" />
      </div>

      <div className="absolute inset-0" aria-hidden>
        {PARTICLES.map((p) => (
          <span
            key={`${p.top}-${p.left}`}
            className="hero-particle absolute rounded-full bg-brand-light"
            style={{ top: p.top, left: p.left, width: p.size, height: p.size, animationDelay: p.delay }}
          />
        ))}
      </div>

      <div className="hero-layer-mid absolute inset-0 flex items-center justify-center" aria-hidden>
        <div className="animate-float w-[46%]">
          <HeroPhone />
        </div>
      </div>

      <div className="hero-layer-front pointer-events-none absolute inset-0" aria-hidden>
        <div className="animate-float-slow absolute right-[4%] top-[5%]">
          <div className="hero-glass rotate-6 rounded-[1.4rem] p-1.5 shadow-[0_0_50px_-6px_rgb(123_63_242/0.8)]">
            <Image
              src="/brand/marcai-icon.png"
              alt=""
              width={96}
              height={96}
              className="size-14 rounded-2xl ring-1 ring-white/10 sm:size-16"
            />
          </div>
        </div>

        <GlassCard className="animate-float-slow bottom-[10%] left-0 sm:bottom-auto sm:-left-4 sm:top-[16%]">
          <IconBadge>
            <CalendarCheck className="size-4" />
          </IconBadge>
          <div className="flex flex-col">
            <span className="text-xs font-medium sm:text-sm">Agendamento confirmado</span>
            <span className="text-[11px] text-muted-foreground sm:text-xs">Hoje · 15:30</span>
          </div>
        </GlassCard>

        <GlassCard className="animate-float right-0 top-[38%] hidden sm:-right-6 sm:flex">
          <IconBadge>
            <BellRing className="size-4" />
          </IconBadge>
          <div className="flex flex-col">
            <span className="text-xs font-medium sm:text-sm">Lembrete automático</span>
            <span className="text-[11px] text-muted-foreground sm:text-xs">Enviado ao cliente</span>
          </div>
        </GlassCard>

        <GlassCard className="animate-float bottom-[14%] left-[2%] hidden sm:flex">
          <IconBadge>
            <Users className="size-4" />
          </IconBadge>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Equipe organizada</span>
            <div className="flex -space-x-1.5">
              {["A", "B", "C"].map((initial, i) => (
                <span
                  key={initial}
                  className="flex size-5 items-center justify-center rounded-full border border-[#0B0B12] text-[9px] font-semibold text-white"
                  style={{ background: ["#7B3FF2", "#9D6BFF", "#B88BFF"][i] }}
                >
                  {initial}
                </span>
              ))}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="animate-float-slow bottom-[16%] right-0 hidden sm:-right-2 flex-col items-start gap-2 sm:flex">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-3.5 text-brand-light" />
            <span className="text-xs text-muted-foreground">Controle do negócio</span>
          </div>
          <div className="flex h-8 items-end gap-1">
            {[40, 62, 48, 75, 58, 90].map((h, i) => (
              <span
                key={i}
                className="w-2 rounded-sm bg-gradient-to-t from-primary to-brand-light"
                style={{ height: `${h}%`, opacity: 0.45 + i * 0.1 }}
              />
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  )
}

function GlassCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`hero-glass absolute flex items-center gap-2.5 rounded-2xl p-2.5 pr-3.5 sm:gap-3 sm:p-3 sm:pr-4 ${className ?? ""}`}>
      {children}
    </div>
  )
}

function IconBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-8 items-center justify-center rounded-xl bg-primary/25 text-brand-light ring-1 ring-primary/40 sm:size-9">
      {children}
    </span>
  )
}
