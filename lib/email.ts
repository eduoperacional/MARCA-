import "server-only"

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

type EmailMessage = {
  to: string
  subject: string
  heading: string
  body: string
  actionLabel: string
  actionUrl: string
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
 * Envia e-mails transacionais pelo Resend. Sem provedor configurado, em desenvolvimento
 * o link é registrado no log do servidor; em produção o envio é recusado com erro explícito.
 */
export async function sendEmail(message: EmailMessage): Promise<{ delivered: boolean }> {
  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV === "development") {
      console.info(`[marcai:email] Provedor não configurado. Para: ${message.to} | ${message.subject} | ${message.actionUrl}`)
      return { delivered: false }
    }
    console.error("[marcai:email] RESEND_API_KEY/EMAIL_FROM ausentes; e-mail não enviado.")
    return { delivered: false }
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: renderHtml(message),
      text: `${message.heading}\n\n${message.body}\n\n${message.actionLabel}: ${message.actionUrl}`,
    }),
  })
  if (!response.ok) {
    console.error("[marcai:email] Falha no envio:", response.status)
    return { delivered: false }
  }
  return { delivered: true }
}
