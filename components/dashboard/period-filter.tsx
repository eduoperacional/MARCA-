"use client"

import { useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { format, subDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ptBR as dayPickerPtBR } from "react-day-picker/locale"
import type { DateRange as DayPickerRange } from "react-day-picker"
import { CalendarRange } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { MAX_CUSTOM_RANGE_DAYS, PERIOD_OPTIONS, type PeriodSelection } from "@/lib/period"
import { dateFromLocal, localFromDate } from "@/lib/time"
import type { PeriodKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Filtro de período sincronizado com a URL (?period=&from=&to=). */
export function PeriodFilter({
  selection,
  today,
  allowFuture = false,
}: {
  selection: PeriodSelection
  today: string
  allowFuture?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const todayDate = dateFromLocal(today)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DayPickerRange | undefined>(
    selection.period === "custom"
      ? { from: dateFromLocal(selection.from), to: dateFromLocal(selection.to) }
      : { from: subDays(todayDate, 13), to: todayDate }
  )

  function navigate(params: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(params)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }))
  }

  const presets = PERIOD_OPTIONS.filter((option) => option.value !== "custom")

  const applyCustom = () => {
    if (!draft?.from) return
    navigate({ period: "custom", from: localFromDate(draft.from), to: localFromDate(draft.to ?? draft.from) })
    setOpen(false)
  }

  const customLabel =
    selection.period === "custom"
      ? `${format(dateFromLocal(selection.from), "dd/MM", { locale: ptBR })} – ${format(dateFromLocal(selection.to), "dd/MM", { locale: ptBR })}`
      : "Personalizado"

  return (
    <div className={cn("flex flex-wrap items-center gap-2 transition-opacity", isPending && "opacity-60")} aria-busy={isPending}>
      <ToggleGroup
        variant="outline"
        size="sm"
        value={selection.period === "custom" ? [] : [selection.period]}
        onValueChange={(value) => {
          const next = value[0] as PeriodKey | undefined
          if (next) navigate({ period: next, from: null, to: null })
        }}
        aria-label="Período de análise"
      >
        {presets.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className="px-3">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant={selection.period === "custom" ? "default" : "outline"}
              size="sm"
              aria-pressed={selection.period === "custom"}
            />
          }
        >
          <CalendarRange data-icon="inline-start" />
          {customLabel}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="range"
            locale={dayPickerPtBR}
            numberOfMonths={2}
            selected={draft}
            onSelect={setDraft}
            defaultMonth={subDays(todayDate, 30)}
            disabled={allowFuture ? undefined : { after: todayDate }}
            max={MAX_CUSTOM_RANGE_DAYS}
          />
          <div className="flex items-center justify-between gap-3 border-t p-3">
            <p className="text-xs text-muted-foreground">Máximo de {MAX_CUSTOM_RANGE_DAYS} dias</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={applyCustom} disabled={!draft?.from}>
                Aplicar
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
