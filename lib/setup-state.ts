import { and, count, eq, isNull } from "drizzle-orm"

import type { BillingDb } from "@/lib/billing/process-asaas-event"
import { businessOnboarding, businesses, professionalServices, professionals, services } from "@/lib/db/schema"
import {
  computeSetupProgress,
  mergeReviewed,
  REVIEWABLE_STEPS,
  type SetupProgress,
  type SetupSnapshot,
  type SetupStepKey,
} from "@/lib/setup-progress"

export type SetupMode = "guided" | "manual"

export interface SetupRecord {
  mode: SetupMode
  reviewedSteps: string[]
  dismissedAt: Date | null
  readyAt: Date | null
}

export interface SetupState {
  progress: SetupProgress
  record: SetupRecord | null
  /** false quando a tabela business_onboarding ainda não existe (script 014 pendente). */
  available: boolean
}

/** Lê o registro de onboarding; null se não existir ou se a tabela ainda não foi criada. */
async function readRecord(db: BillingDb, businessId: string): Promise<{ record: SetupRecord | null; available: boolean }> {
  try {
    const [row] = await db
      .select({
        mode: businessOnboarding.mode,
        reviewedSteps: businessOnboarding.reviewedSteps,
        dismissedAt: businessOnboarding.dismissedAt,
        readyAt: businessOnboarding.readyAt,
      })
      .from(businessOnboarding)
      .where(eq(businessOnboarding.businessId, businessId))
      .limit(1)
    return { record: row ?? null, available: true }
  } catch (error) {
    console.error("[onboarding] business_onboarding indisponível — execute scripts/014-onboarding-hibrido.sql", error)
    return { record: null, available: false }
  }
}

export async function loadSetupSnapshot(db: BillingDb, businessId: string, reviewedSteps: readonly string[]): Promise<SetupSnapshot | null> {
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1)
  if (!business) return null

  const [serviceCount, pros, links] = await Promise.all([
    db
      .select({ total: count() })
      .from(services)
      .where(and(eq(services.businessId, businessId), eq(services.active, true))),
    db
      .select({ id: professionals.id, workSchedule: professionals.workSchedule })
      .from(professionals)
      .where(and(eq(professionals.businessId, businessId), eq(professionals.active, true))),
    db
      .select({ professionalId: professionalServices.professionalId })
      .from(professionalServices)
      .innerJoin(services, eq(services.id, professionalServices.serviceId))
      .where(and(eq(services.businessId, businessId), eq(services.active, true))),
  ])

  const withServices = new Set(links.map((l) => l.professionalId))
  const bookable = pros.filter((p) => withServices.has(p.id) && (p.workSchedule ?? []).some((d) => d.active)).length

  // Cadastros concluídos no fluxo antigo, antes do script 014, valem como revisados.
  const reviewed = business.onboardingCompletedAt && reviewedSteps.length === 0 ? REVIEWABLE_STEPS : reviewedSteps

  return {
    business: {
      name: business.name,
      segment: business.segment,
      phone: business.phone,
      address: business.address,
      city: business.city,
      state: business.state,
      openingHours: business.openingHours ?? [],
      onlineBookingEnabled: business.onlineBookingEnabled,
    },
    activeServices: serviceCount[0]?.total ?? 0,
    activeProfessionals: pros.length,
    bookableProfessionals: bookable,
    reviewedSteps: reviewed,
  }
}

export async function getSetupState(db: BillingDb, businessId: string): Promise<SetupState | null> {
  const { record, available } = await readRecord(db, businessId)
  const snapshot = await loadSetupSnapshot(db, businessId, record?.reviewedSteps ?? [])
  if (!snapshot) return null
  return { progress: computeSetupProgress(snapshot), record, available }
}

/**
 * Registra uma alteração de configuração (do assistente ou do painel): soma as etapas revisadas e,
 * quando todas as etapas essenciais estão concluídas, marca o estabelecimento como pronto.
 * Nunca lança erro, para não quebrar o salvamento que a chamou.
 */
export async function recordSetupChange(
  db: BillingDb,
  businessId: string,
  options: { reviewed?: readonly SetupStepKey[]; mode?: SetupMode; dismissed?: boolean } = {}
): Promise<SetupState | null> {
  try {
    const { record, available } = await readRecord(db, businessId)
    if (!available) return getSetupState(db, businessId)

    const reviewedSteps = mergeReviewed(record?.reviewedSteps ?? [], options.reviewed ?? [])
    const snapshot = await loadSetupSnapshot(db, businessId, reviewedSteps)
    if (!snapshot) return null
    const progress = computeSetupProgress(snapshot)

    const now = new Date()
    const values = {
      mode: options.mode ?? record?.mode ?? "guided",
      reviewedSteps,
      dismissedAt: options.dismissed === undefined ? (record?.dismissedAt ?? null) : options.dismissed ? now : null,
      readyAt: record?.readyAt ?? (progress.ready ? now : null),
      updatedAt: now,
    }
    await db
      .insert(businessOnboarding)
      .values({ businessId, ...values })
      .onConflictDoUpdate({ target: businessOnboarding.businessId, set: values })

    if (progress.ready) {
      await db
        .update(businesses)
        .set({ onboardingCompletedAt: now })
        .where(and(eq(businesses.id, businessId), isNull(businesses.onboardingCompletedAt)))
    }
    return { progress, record: values, available: true }
  } catch (error) {
    console.error("[onboarding] falha ao registrar progresso", error)
    return null
  }
}
