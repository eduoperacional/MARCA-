"use client"

import { useRef, useState, useTransition } from "react"
import useSWR from "swr"

import { createPublicBooking } from "@/app/actions/public-booking"
import { BookingDone } from "@/components/booking/booking-done"
import { BookingStepper } from "@/components/booking/booking-stepper"
import { BookingSummary, MobileActionBar, type SummaryAction } from "@/components/booking/booking-summary"
import type { ActiveStep, PublicProfessional, PublicService, Step } from "@/components/booking/booking-types"
import { DETAILS_FORM_ID, DetailsStep } from "@/components/booking/details-step"
import { ProfessionalStep } from "@/components/booking/professional-step"
import { ServiceStep } from "@/components/booking/service-step"
import { TimeStep } from "@/components/booking/time-step"
import { addDays, weekdayOf } from "@/lib/time"

const slotsFetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error("Falha ao carregar horários")
  return (await res.json()) as { slots: string[] }
}

export function BookingFlow({
  slug,
  businessName,
  today,
  openWeekdays,
  services,
  professionals,
}: {
  slug: string
  businessName: string
  today: string
  openWeekdays: number[]
  services: PublicService[]
  professionals: PublicProfessional[]
}) {
  const [step, setStep] = useState<Step>("service")
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [professionalId, setProfessionalId] = useState<string | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [confirmedWith, setConfirmedWith] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const topRef = useRef<HTMLDivElement>(null)

  const service = services.find((s) => s.id === serviceId) ?? null
  const professional = professionals.find((p) => p.id === professionalId) ?? null
  const eligible = professionals.filter((p) => service?.professionalIds.includes(p.id))

  const workdays = new Set((professional ? [professional] : eligible).flatMap((p) => p.workdays))
  const days = Array.from({ length: 21 }, (_, i) => addDays(today, i)).filter((d) => {
    const wd = weekdayOf(d)
    return openWeekdays.includes(wd) && workdays.has(wd)
  })

  const slotsKey =
    step === "time" && service && date
      ? `/api/slots?${new URLSearchParams({ slug, serviceId: service.id, date, ...(professionalId ? { professionalId } : {}) })}`
      : null
  const { data: slotData, isLoading: loadingSlots, mutate: refreshSlots } = useSWR(slotsKey, slotsFetcher)

  function goTo(next: Step) {
    setStep(next)
    requestAnimationFrame(() => {
      const top = topRef.current
      if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  function navigateBack(target: ActiveStep) {
    setError(null)
    goTo(target)
  }

  function selectService(s: PublicService) {
    setServiceId(s.id)
    if (professionalId && !s.professionalIds.includes(professionalId)) setProfessionalId(null)
    setTime(null)
  }

  function selectProfessional(id: string | null) {
    setProfessionalId(id)
    setDate(null)
    setTime(null)
  }

  function continueFromProfessional() {
    if (!date && days.length > 0) setDate(days[0])
    goTo("time")
  }

  function submit() {
    if (!service || !date || !time) return
    setError(null)
    startTransition(async () => {
      const result = await createPublicBooking({ slug, serviceId: service.id, professionalId, date, start: time, name, phone, notes })
      if (!result.ok) {
        setError(result.error)
        if (result.error.includes("ocupado")) {
          setTime(null)
          goTo("time")
          refreshSlots()
        }
        return
      }
      const data = (result as { data?: { professionalName?: string } }).data
      setConfirmedWith(data?.professionalName || professional?.name || null)
      goTo("done")
    })
  }

  if (step === "done" && service && date && time) {
    return (
      <div ref={topRef} className="scroll-mt-6">
        <BookingDone
          businessName={businessName}
          service={service}
          professionalName={confirmedWith}
          date={date}
          time={time}
          onRestart={() => {
            setServiceId(null)
            setProfessionalId(null)
            setDate(null)
            setTime(null)
            setNotes("")
            goTo("service")
          }}
        />
      </div>
    )
  }

  const activeStep = step as ActiveStep
  const action: SummaryAction = {
    service: { label: "Continuar", disabled: !service, pending: false, onClick: () => goTo("professional") },
    professional: { label: "Ver horários", disabled: !service, pending: false, onClick: continueFromProfessional },
    time: {
      label: "Continuar",
      disabled: !time,
      pending: false,
      onClick: () => {
        setError(null)
        goTo("details")
      },
    },
    details: {
      label: pending ? "Confirmando…" : "Confirmar agendamento",
      disabled: !name.trim() || !phone.trim(),
      pending,
      submitsForm: DETAILS_FORM_ID,
    },
  }[activeStep]

  const showProfessional = activeStep !== "service"
  const professionalLabel = showProfessional ? (professional?.name ?? "Qualquer profissional") : null

  return (
    <div ref={topRef} className="grid scroll-mt-6 gap-8 pb-28 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10 lg:pb-0">
      <div className="flex min-w-0 flex-col gap-8">
        <BookingStepper current={activeStep} onNavigate={navigateBack} />

        <div key={activeStep} className="animate-in fade-in slide-in-from-bottom-3 duration-300 motion-reduce:animate-none">
          {activeStep === "service" && <ServiceStep services={services} selectedId={serviceId} onSelect={selectService} />}

          {activeStep === "professional" && service && (
            <ProfessionalStep professionals={eligible} selectedId={professionalId} onSelect={selectProfessional} />
          )}

          {activeStep === "time" && service && (
            <TimeStep
              today={today}
              days={days}
              date={date}
              time={time}
              slots={slotData?.slots}
              loading={loadingSlots}
              hasProfessional={!!professional}
              error={error}
              onSelectDate={(d) => {
                setDate(d)
                setTime(null)
              }}
              onSelectTime={(slot) => {
                setTime(slot)
                setError(null)
              }}
            />
          )}

          {activeStep === "details" && service && date && time && (
            <DetailsStep
              businessName={businessName}
              name={name}
              phone={phone}
              notes={notes}
              error={error}
              onNameChange={setName}
              onPhoneChange={setPhone}
              onNotesChange={setNotes}
              onSubmit={submit}
            />
          )}
        </div>
      </div>

      <div className="hidden lg:block">
        <BookingSummary service={service} professionalLabel={professionalLabel} date={date} time={time} action={action} />
      </div>

      <MobileActionBar service={service} time={time} action={action} />
    </div>
  )
}
