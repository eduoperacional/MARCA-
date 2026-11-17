import { isMissingTable, processWhatsappQueue } from "@/lib/whatsapp/service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Processa a fila de WhatsApp: novas tentativas com backoff e entregas interrompidas. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  try {
    const summary = await processWhatsappQueue(50)
    console.info(
      summary.configured
        ? `[whatsapp-cron] reservadas ${summary.claimed} | enviadas ${summary.sent} | nova tentativa ${summary.retry} | ` +
            `falhas ${summary.failed} | ignoradas ${summary.skipped} | erros ${summary.errors}`
        : "[whatsapp-cron] credenciais da Meta ausentes: fila não processada"
    )
    return Response.json(summary)
  } catch (error) {
    if (isMissingTable(error)) return Response.json({ skipped: "script 015 não executado" })
    console.error("[whatsapp-cron] falha", error)
    return Response.json({ error: "internal" }, { status: 500 })
  }
}
