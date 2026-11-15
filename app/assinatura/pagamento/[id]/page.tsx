import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CheckCircle2 } from "lucide-react"

import { AutoRefresh, CopyButton } from "@/components/billing/billing-form"
import { buttonVariants } from "@/components/ui/button"
import { isUuid } from "@/lib/actions/result"
import { getPayment, getPixQrCode } from "@/lib/billing/asaas"
import { getOwnTransaction } from "@/lib/billing/self-service"
import { requireAccess } from "@/lib/business"
import { db } from "@/lib/db"
import { formatCents, formatDate } from "@/lib/format"

export const metadata: Metadata = { title: "Pagamento" }

export default async function PaymentPage({ params }: PageProps<"/assinatura/pagamento/[id]">) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const access = await requireAccess()
  const tx = await getOwnTransaction(db, access.business.id, id)
  if (!tx) notFound()

  if (tx.status === "approved") {
    return (
      <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <CheckCircle2 aria-hidden className="size-10 text-success" />
        <h1 className="text-xl font-semibold text-foreground">Pagamento confirmado</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Recebemos {formatCents(tx.amountCents)}. Seu plano já está liberado.
        </p>
        <Link href="/painel" className={buttonVariants()}>Ir para o painel</Link>
      </section>
    )
  }

  if (tx.status !== "pending") {
    return (
      <section className="mx-auto flex max-w-md flex-col gap-3 rounded-xl border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold text-foreground">Esta cobrança não está mais em aberto</h1>
        <Link href="/assinatura" className={buttonVariants({ variant: "outline" })}>Ver assinatura</Link>
      </section>
    )
  }

  // Dados de pagamento vêm direto do Asaas pelo servidor; o navegador nunca informa valores.
  const payment = await getPayment(tx.gatewayTransactionId).catch(() => null)
  const pix = payment?.billingType === "PIX" ? await getPixQrCode(tx.gatewayTransactionId).catch(() => null) : null
  const invoiceUrl = payment?.invoiceUrl ?? tx.invoiceUrl

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-6 rounded-xl border bg-card p-6 md:p-8">
      <AutoRefresh seconds={6} />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">Finalize o pagamento</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {formatCents(tx.amountCents)} · vencimento {formatDate(tx.dueDate)}. Esta página atualiza sozinha quando o
          pagamento for confirmado.
        </p>
      </div>

      {pix && (
        <div className="flex flex-col items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR Code em base64 retornado pelo Asaas */}
          <img
            src={`data:image/png;base64,${pix.encodedImage}`}
            alt="QR Code Pix para pagamento"
            width={224}
            height={224}
            className="rounded-lg bg-foreground p-2"
          />
          <div className="flex w-full flex-col gap-2">
            <label htmlFor="pix-code" className="text-xs text-muted-foreground">
              Pix copia e cola
            </label>
            <textarea
              id="pix-code"
              readOnly
              value={pix.payload}
              rows={3}
              className="w-full resize-none rounded-lg border bg-background/60 p-3 font-mono text-xs break-all text-foreground"
            />
            <CopyButton value={pix.payload} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {payment?.bankSlipUrl && payment.billingType === "BOLETO" && (
          <a href={payment.bankSlipUrl} target="_blank" rel="noreferrer" className={buttonVariants()}>
              Abrir boleto
            </a>
        )}
        {invoiceUrl && (
          <a href={invoiceUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: pix || payment?.billingType === "BOLETO" ? "outline" : "default" })}>
              {payment?.billingType === "CREDIT_CARD" ? "Pagar com cartão" : "Abrir fatura"}
            </a>
        )}
        <Link href="/assinatura" className={buttonVariants({ variant: "ghost" })}>Voltar</Link>
      </div>
      {!payment && (
        <p className="text-sm text-muted-foreground">
          Não foi possível carregar os dados da cobrança agora. Use o link da fatura ou tente novamente.
        </p>
      )}
    </section>
  )
}
