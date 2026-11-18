import "server-only"

import { betterAuth } from "better-auth"
import { APIError } from "better-auth/api"
import { nextCookies } from "better-auth/next-js"

import { pool } from "@/lib/db"
import { isEmailConfigured, sendEmail } from "@/lib/email"
import { isCurrentLegalAcceptance, LEGAL_ACCEPTANCE_ERROR } from "@/lib/legal"
import { recordLegalAcceptance } from "@/lib/legal-acceptance"
import { getAuthBaseURL, getTrustedAuthOrigins } from "@/lib/auth-origin-policy"

const SIGN_UP_PATH = "/sign-up/email"

export const auth = betterAuth({
  database: pool,
  baseURL: getAuthBaseURL(process.env),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      // Not awaited so response timing does not reveal whether the account exists.
      void sendEmail({
        to: user.email,
        subject: "Redefina sua senha da MARCAÍ",
        heading: "Redefinição de senha",
        body: "Recebemos um pedido para redefinir a senha da sua conta. O link é válido por 1 hora.",
        actionLabel: "Criar nova senha",
        actionUrl: url,
      })
    },
  },
  emailVerification: {
    sendOnSignUp: isEmailConfigured(),
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      void sendEmail({
        to: user.email,
        subject: "Confirme seu e-mail na MARCAÍ",
        heading: "Confirme seu e-mail",
        body: `Olá, ${user.name}. Confirme seu endereço de e-mail para proteger sua conta.`,
        actionLabel: "Confirmar e-mail",
        actionUrl: url,
      })
    },
  },
  user: {
    additionalFields: {
      phone: { type: "string", required: false, input: true },
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        void sendEmail({
          to: user.email,
          subject: "Confirme a alteração de e-mail",
          heading: "Alteração de e-mail",
          body: `Confirme a alteração do e-mail da sua conta para ${newEmail}.`,
          actionLabel: "Confirmar alteração",
          actionUrl: url,
        })
      },
    },
  },
  trustedOrigins: getTrustedAuthOrigins(process.env),
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/change-password": { window: 60, max: 5 },
      "/change-email": { window: 60, max: 3 },
      "/request-password-reset": { window: 300, max: 3 },
      "/reset-password": { window: 300, max: 5 },
      "/send-verification-email": { window: 300, max: 3 },
    },
  },
  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          // Required by the cross-site v0 preview iframe. Without these
          // attributes, login succeeds but the next request appears signed out.
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }
    : {}),
  databaseHooks: {
    user: {
      create: {
        before: async (user, context) => {
          if (context?.path === SIGN_UP_PATH && !isCurrentLegalAcceptance(context.body)) {
            throw new APIError("BAD_REQUEST", {
              code: LEGAL_ACCEPTANCE_ERROR,
              message: "Aceite os Termos de Uso e a Política de Privacidade vigentes para criar a conta.",
            })
          }
          return { data: user }
        },
        after: async (user, context) => {
          if (context?.path === SIGN_UP_PATH) await recordLegalAcceptance(pool, user.id)
        },
      },
    },
  },
  plugins: [nextCookies()],
})

export type AuthSession = typeof auth.$Infer.Session
