export type EmailMessage = {
  to: string
  subject: string
  heading: string
  body: string
  actionLabel: string
  actionUrl: string
}

export type EmailEnv = Record<string, string | undefined> & {
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
}

type Logger = Pick<Console, "info" | "error">

export function isEmailConfiguredIn(env: EmailEnv) {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

function renderHtml({ heading, body, actionLabel, actionUrl }: EmailMessage) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#0B0B12;font-family:Inter,Arial,sans-serif;color:#F5F5F7">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#1A1A24;border-radius:16px;padding:32px">
<tr><td style="font-size:20px;font-weight:700;letter-spacing:-0.02em">MARCA<span style="color:#B88BFF">Í</span></td></tr>
<tr><td style="padding-top:24px;font-size:18px;font-weight:600">${escapeHtml(heading)}</td></tr>
<tr><td style="padding-top:12px;font-size:14px;line-height:1.6;color:#C9C9D1">${escapeHtml(body)}</td></tr>
<tr><td style="padding-top:24px"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#7B3FF2;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:10px">${escapeHtml(actionLabel)}</a></td></tr>
<tr><td style="padding-top:24px;font-size:12px;line-height:1.6;color:#8A8A95">Se você não solicitou esta ação, ignore este e-mail.</td></tr>
</table></td></tr></table></body></html>`
}

/**
 * Envia e-mails transacionais pelo Resend.
 * Os logs nunca incluem destinatário, link de ação ou token: esses links concedem acesso
 * à conta (redefinição de senha, confirmação de e-mail, convites) e logs são lidos por
 * mais pessoas e sistemas do que o dono da conta.
 */
export async function deliverEmail(
  message: EmailMessage,
  env: EmailEnv,
  fetchImpl: typeof fetch = fetch,
  logger: Logger = console,
): Promise<{ delivered: boolean }> {
  if (!isEmailConfiguredIn(env)) {
    logger.error("[marcai:email] RESEND_API_KEY/EMAIL_FROM ausentes; e-mail não enviado.")
    return { delivered: false }
  }

  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        html: renderHtml(message),
        text: `${message.heading}\n\n${message.body}\n\n${message.actionLabel}: ${message.actionUrl}`,
      }),
    })
    if (!response.ok) {
      logger.error("[marcai:email] Falha no envio:", response.status)
      return { delivered: false }
    }
    return { delivered: true }
  } catch {
    logger.error("[marcai:email] Falha de rede ao contatar o provedor de e-mail.")
    return { delivered: false }
  }
}
