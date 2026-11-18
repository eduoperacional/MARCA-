import "server-only"

import { deliverEmail, isEmailConfiguredIn, type EmailMessage } from "@/lib/email-delivery"

export function isEmailConfigured() {
  return isEmailConfiguredIn(process.env)
}

export async function sendEmail(message: EmailMessage): Promise<{ delivered: boolean }> {
  return deliverEmail(message, process.env)
}
