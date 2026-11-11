"use client"

import { useMemo, useState } from "react"
import { Globe, Lock, Trash2 } from "lucide-react"

import { deleteTimeBlock } from "@/app/actions/operations"
import { AppointmentActions } from "@/components/shared/appointment-actions"
import type { AppointmentDefaults } from "@/components/shared/appointment-dialog"
import { StatusBadge } from "@/components/shared/status-badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useServerAction } from "@/hooks/use-server-action"
import { formatCurrency } from "@/lib/format"
import type { ProfessionalItem, TimeBlockItem } from "@/lib/queries/catalog"
import type { FormOptions } from "@/lib/queries/options"
import { minutesToTime, timeToMinutes, weekdayOf } from "@/lib/time"
import type { Appointment, DaySchedule } from "@/lib/types"
import { cn } from "@/lib/utils"

const PX_PER_MIN = 1.25
const CREATE_STEP = 30

interface Column {
  key: string
  date: string
  professional: ProfessionalItem | null
  label: string
}

interface Props {
  columns: Column[]
  professionals: ProfessionalItem[]
  today: string
  appointments: Appointment[]
  blocks: TimeBlockItem[]
  openingHours: DaySchedule[]
  slotInterval: number
  options: FormOptions
  onCreate: (defaults: AppointmentDefaults) => void
}

function dayWindow(schedule: DaySchedule[], date: string) {
  const day = schedule.find((d) => d.weekday === weekdayOf(date))
  if (!day?.active) return null
  return {
    start: timeToMinutes(day.start),
    end: timeToMinutes(day.end),
    breakStart: day.breakStart ? timeToMinutes(day.breakStart) : null,
    breakEnd: day.breakEnd ? timeToMinutes(day.breakEnd) : null,
  }
}

/** Distribui eventos sobrepostos em faixas lado a lado. */
function layoutLanes(items: Appointment[]) {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start))
  const result: { item: Appointment; lane: number; lanes: number }[] = []
  let cluster: { item: Appointment; lane: number }[] = []
  let clusterEnd = -1
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1))
    for (const c of cluster) result.push({ ...c, lanes })
    cluster = []
  }
  for (const item of sorted) {
    const start = timeToMinutes(item.start)
    const end = timeToMinutes(item.end)
    if (start >= clusterEnd && cluster.length) flush()
    const laneEnds: number[] = []
    for (const c of cluster) laneEnds[c.lane] = Math.max(laneEnds[c.lane] ?? 0, timeToMinutes(c.item.end))
    let lane = laneEnds.findIndex((e) => e <= start)
    if (lane === -1) lane = laneEnds.length
    cluster.push({ item, lane })
    clusterEnd = Math.max(clusterEnd, end)
  }
  if (cluster.length) flush()
  return result
}

export function AgendaGrid({ columns, professionals, today, appointments, blocks, openingHours, options, onCreate }: Props) {
  const { startMin, endMin } = useMemo(() => {
    let s = 24 * 60
    let e = 0
    const schedules = [openingHours, ...professionals.map((p) => p.workSchedule)]
    for (const col of columns) {
      for (const schedule of schedules) {
        const w = dayWindow(schedule, col.date)
        if (w) {
          s = Math.min(s, w.start)
          e = Math.max(e, w.end)
        }
      }
    }
    for (const a of appointments) {
      s = Math.min(s, timeToMinutes(a.start))
      e = Math.max(e, timeToMinutes(a.end))
    }
    if (s >= e) return { startMin: 8 * 60, endMin: 18 * 60 }
    return { startMin: Math.floor(s / 60) * 60, endMin: Math.ceil(e / 60) * 60 }
  }, [columns, professionals, openingHours, appointments])

  const hours: number[] = []
  for (let m = startMin; m < endMin; m += 60) hours.push(m)
  const height = (endMin - startMin) * PX_PER_MIN
  const minWidth = columns.length > 4 ? columns.length * 150 : undefined

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth }} className="flex flex-col">
        <div className="sticky top-0 z-20 flex border-b bg-card">
          <div className="w-14 shrink-0 border-r" />
          {columns.map((col) => (
            <div
              key={col.key}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 border-r px-3 py-2.5 last:border-r-0",
                col.date === today && columns.length > 1 && !col.professional && "bg-primary/10"
              )}
            >
              {col.professional && columns.every((c) => c.date === col.date) && (
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: col.professional.color }} aria-hidden="true" />
              )}
              <span className="truncate text-sm font-medium capitalize">{col.label}</span>
            </div>
          ))}
        </div>

        <div className="flex">
          <div className="relative w-14 shrink-0 border-r" style={{ height }} aria-hidden="true">
            {hours.map((m) => (
              <span
                key={m}
                className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums first:translate-y-0"
                style={{ top: (m - startMin) * PX_PER_MIN }}
              >
                {minutesToTime(m)}
              </span>
            ))}
          </div>
          {columns.map((col) => (
            <DayColumn
              key={col.key}
              column={col}
              startMin={startMin}
              endMin={endMin}
              hours={hours}
              openingHours={openingHours}
              appointments={appointments.filter(
                (a) => a.date === col.date && (!col.professional || a.professional.id === col.professional.id)
              )}
              blocks={blocks.filter(
                (b) =>
                  b.date <= col.date &&
                  b.endDate >= col.date &&
                  (!b.professionalId || !col.professional || b.professionalId === col.professional.id)
              )}
              options={options}
              onCreate={onCreate}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DayColumn({
  column,
  startMin,
  endMin,
  hours,
  openingHours,
  appointments,
  blocks,
  options,
  onCreate,
}: {
  column: Column
  startMin: number
  endMin: number
  hours: number[]
  openingHours: DaySchedule[]
  appointments: Appointment[]
  blocks: TimeBlockItem[]
  options: FormOptions
  onCreate: (defaults: AppointmentDefaults) => void
}) {
  const height = (endMin - startMin) * PX_PER_MIN
  const business = dayWindow(openingHours, column.date)
  const work = column.professional ? dayWindow(column.professional.workSchedule, column.date) : business
  const open = work && business ? { start: Math.max(work.start, business.start), end: Math.min(work.end, business.end) } : null

  const slots: number[] = []
  if (open) for (let m = open.start; m + CREATE_STEP <= open.end; m += CREATE_STEP) slots.push(m)

  const shades: { top: number; height: number; label?: string }[] = []
  if (!open) shades.push({ top: 0, height, label: "Fechado" })
  else {
    if (open.start > startMin) shades.push({ top: 0, height: (open.start - startMin) * PX_PER_MIN })
    if (open.end < endMin) shades.push({ top: (open.end - startMin) * PX_PER_MIN, height: (endMin - open.end) * PX_PER_MIN })
    if (work?.breakStart != null && work.breakEnd != null) {
      shades.push({
        top: (work.breakStart - startMin) * PX_PER_MIN,
        height: (work.breakEnd - work.breakStart) * PX_PER_MIN,
        label: "Intervalo",
      })
    }
  }

  const lanes = layoutLanes(appointments)

  return (
    <div className="relative min-w-0 flex-1 border-r last:border-r-0" style={{ height }}>
      {hours.map((m) => (
        <div key={m} className="absolute inset-x-0 border-t border-border/60" style={{ top: (m - startMin) * PX_PER_MIN }} aria-hidden="true" />
      ))}
      {shades.map((s, i) => (
        <div
          key={i}
          className="absolute inset-x-0 flex items-start justify-center bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,var(--color-muted)_6px,var(--color-muted)_7px)] bg-muted/40 pt-1"
          style={{ top: s.top, height: s.height }}
          aria-hidden="true"
        >
          {s.label && s.height > 24 && <span className="text-[11px] text-muted-foreground">{s.label}</span>}
        </div>
      ))}
      {slots.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() =>
            onCreate({ date: column.date, start: minutesToTime(m), professionalId: column.professional?.id })
          }
          className="group absolute inset-x-0 flex items-center px-2 text-[11px] text-transparent outline-none hover:bg-primary/10 hover:text-brand-light focus-visible:bg-primary/10 focus-visible:text-brand-light"
          style={{ top: (m - startMin) * PX_PER_MIN, height: CREATE_STEP * PX_PER_MIN }}
          aria-label={`Agendar às ${minutesToTime(m)}${column.professional ? ` com ${column.professional.name}` : ""}`}
        >
          + {minutesToTime(m)}
        </button>
      ))}
      {blocks.map((b) => (
        <BlockItem key={b.id} block={b} date={column.date} startMin={startMin} endMin={endMin} />
      ))}
      {lanes.map(({ item, lane, lanes: total }) => (
        <AppointmentBlock
          key={item.id}
          appointment={item}
          startMin={startMin}
          lane={lane}
          lanes={total}
          showProfessional={!column.professional}
          options={options}
        />
      ))}
    </div>
  )
}

function BlockItem({ block, date, startMin, endMin }: { block: TimeBlockItem; date: string; startMin: number; endMin: number }) {
  const [confirm, setConfirm] = useState(false)
  const { pending, run } = useServerAction()
  const s = block.date < date ? startMin : Math.max(startMin, timeToMinutes(block.start))
  const e = block.endDate > date ? endMin : Math.min(endMin, timeToMinutes(block.end))
  if (e <= s) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="absolute inset-x-1 z-10 flex items-start gap-1.5 overflow-hidden rounded-md border border-dashed border-muted-foreground/40 bg-muted/90 px-2 py-1 text-left text-xs text-muted-foreground outline-none hover:border-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        style={{ top: (s - startMin) * PX_PER_MIN, height: Math.max(18, (e - s) * PX_PER_MIN - 2) }}
        aria-label={`Horário bloqueado ${block.start}–${block.end}${block.reason ? `: ${block.reason}` : ""}. Remover bloqueio`}
      >
        <Lock className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{block.reason || "Bloqueado"}</span>
      </button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover bloqueio?</AlertDialogTitle>
            <AlertDialogDescription>
              {block.reason || "Bloqueio"} · {block.start}–{block.end}. O horário voltará a ficar disponível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => run(() => deleteTimeBlock(block.id), "Bloqueio removido.")}>
              <Trash2 data-icon="inline-start" />
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function AppointmentBlock({
  appointment: a,
  startMin,
  lane,
  lanes,
  showProfessional,
  options,
}: {
  appointment: Appointment
  startMin: number
  lane: number
  lanes: number
  showProfessional: boolean
  options: FormOptions
}) {
  const top = (timeToMinutes(a.start) - startMin) * PX_PER_MIN
  const h = Math.max(22, (timeToMinutes(a.end) - timeToMinutes(a.start)) * PX_PER_MIN - 2)
  const muted = a.status === "no_show" || a.status === "completed"

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "absolute z-10 flex flex-col overflow-hidden rounded-md border-l-[3px] bg-card px-2 py-1 text-left shadow-sm ring-1 ring-border outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
              muted && "opacity-70",
              a.status === "no_show" && "line-through"
            )}
            style={{
              top,
              height: h,
              left: `calc(${(lane / lanes) * 100}% + 2px)`,
              width: `calc(${100 / lanes}% - 4px)`,
              borderLeftColor: a.professional.color,
              backgroundColor: `color-mix(in oklch, ${a.professional.color} 14%, var(--card))`,
            }}
            aria-label={`${a.start} ${a.clientName}, ${a.service.name}`}
          />
        }
      >
        <span className="truncate text-xs font-medium">{a.clientName}</span>
        {h > 34 && (
          <span className="truncate text-[11px] text-muted-foreground tabular-nums">
            {a.start}–{a.end} · {a.service.name}
          </span>
        )}
        {showProfessional && h > 50 && <span className="truncate text-[11px] text-muted-foreground">{a.professional.name}</span>}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{a.clientName}</span>
              <span className="text-xs text-muted-foreground">{a.clientPhone}</span>
            </div>
            <AppointmentActions appointment={a} options={options} />
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Horário</dt>
            <dd className="tabular-nums">
              {a.start}–{a.end}
            </dd>
            <dt className="text-muted-foreground">Serviço</dt>
            <dd>{a.service.name}</dd>
            <dt className="text-muted-foreground">Profissional</dt>
            <dd>{a.professional.name}</dd>
            <dt className="text-muted-foreground">Valor</dt>
            <dd className="tabular-nums">{formatCurrency(a.price, true)}</dd>
          </dl>
          {a.notes && <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">{a.notes}</p>}
          <div className="flex items-center gap-2">
            <StatusBadge status={a.status} />
            {a.source === "online" && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Globe className="size-3" aria-hidden="true" /> Agendado online
              </span>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
