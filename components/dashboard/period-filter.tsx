"use client"

import { useState } from "react"
import { format, subDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ptBR as dayPickerPtBR } from "react-day-picker/locale"
import type { DateRange as DayPickerRange } from "react-day-picker"
import { CalendarRange } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  MAX_CUSTOM_RANGE_DAYS,
  PERIOD_OPTIONS,
  getReferenceDate,
} from "@/lib/data/dashboard"
import type { DateRange, PeriodKey } from "@/lib/types"

interface PeriodFilterProps {
  period: PeriodKey
  customRange?: DateRange
  onPeriodChange: (period: PeriodKey) => void
  onCustomRangeChange: (range: DateRange) => void
}

export function PeriodFilter({
  period,
  customRange,
  onPeriodChange,
  onCustomRangeChange,
}: PeriodFilterProps) {
  const today = getReferenceDate()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DayPickerRange | undefined>(
    customRange ?? { from: subDays(today, 13), to: today }
  )

  const presets = PERIOD_OPTIONS.filter((option) => option.value !== "custom")

  const applyCustom = () => {
    if (!draft?.from) return
    onCustomRangeChange({ from: draft.from, to: draft.to ?? draft.from })
    onPeriodChange("custom")
    setOpen(false)
  }

  const customLabel =
    period === "custom" && customRange
      ? `${format(customRange.from, "dd/MM", { locale: ptBR })} – ${format(customRange.to, "dd/MM", { locale: ptBR })}`
      : "Personalizado"

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        variant="outline"
        size="sm"
        value={period === "custom" ? [] : [period]}
        onValueChange={(value) => {
          const next = value[0] as PeriodKey | undefined
          if (next) onPeriodChange(next)
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
              variant={period === "custom" ? "default" : "outline"}
              size="sm"
              aria-pressed={period === "custom"}
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
            defaultMonth={subDays(today, 30)}
            disabled={{ after: today }}
            max={MAX_CUSTOM_RANGE_DAYS}
          />
          <div className="flex items-center justify-between gap-3 border-t p-3">
            <p className="text-xs text-muted-foreground">
              Máximo de {MAX_CUSTOM_RANGE_DAYS} dias
            </p>
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
