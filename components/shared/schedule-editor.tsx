"use client"

import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { WEEKDAY_LABELS } from "@/lib/time"
import type { DaySchedule } from "@/lib/types"
import { cn } from "@/lib/utils"

const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export function defaultSchedule(): DaySchedule[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    active: weekday !== 0,
    start: "09:00",
    end: weekday === 6 ? "14:00" : "19:00",
    breakStart: weekday === 6 ? null : "12:00",
    breakEnd: weekday === 6 ? null : "13:00",
  }))
}

/** Editor de jornada semanal com abertura, fechamento e intervalo opcional. */
export function ScheduleEditor({
  value,
  onChange,
  idPrefix,
}: {
  value: DaySchedule[]
  onChange: (next: DaySchedule[]) => void
  idPrefix: string
}) {
  function update(weekday: number, patch: Partial<DaySchedule>) {
    onChange(value.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)))
  }

  return (
    <div className="flex flex-col divide-y rounded-lg border">
      {DISPLAY_ORDER.map((weekday) => {
        const day = value.find((d) => d.weekday === weekday)
        if (!day) return null
        const label = WEEKDAY_LABELS[weekday]
        const id = `${idPrefix}-${weekday}`
        return (
          <div key={weekday} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
            <label htmlFor={`${id}-active`} className="flex w-32 shrink-0 items-center gap-2 text-sm font-medium">
              <Switch id={`${id}-active`} checked={day.active} onCheckedChange={(active) => update(weekday, { active })} />
              {label}
            </label>
            <div className={cn("flex flex-wrap items-center gap-2 text-sm", !day.active && "pointer-events-none opacity-40")}>
              <Input
                type="time"
                step={900}
                aria-label={`${label}: abertura`}
                className="w-26"
                value={day.start}
                disabled={!day.active}
                onChange={(e) => update(weekday, { start: e.target.value })}
              />
              <span className="text-muted-foreground">às</span>
              <Input
                type="time"
                step={900}
                aria-label={`${label}: fechamento`}
                className="w-26"
                value={day.end}
                disabled={!day.active}
                onChange={(e) => update(weekday, { end: e.target.value })}
              />
              <span className="ml-1 text-muted-foreground">Intervalo</span>
              <Input
                type="time"
                step={900}
                aria-label={`${label}: início do intervalo`}
                className="w-26"
                value={day.breakStart ?? ""}
                disabled={!day.active}
                onChange={(e) => update(weekday, { breakStart: e.target.value || null })}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="time"
                step={900}
                aria-label={`${label}: fim do intervalo`}
                className="w-26"
                value={day.breakEnd ?? ""}
                disabled={!day.active}
                onChange={(e) => update(weekday, { breakEnd: e.target.value || null })}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
