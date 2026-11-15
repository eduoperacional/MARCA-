-- 010 - (Opcional, recomendado) Enfileira para cancelamento no Asaas os trials que já estavam
-- expirados antes desta versão. O cron anterior expirava o trial só no banco, então essas
-- assinaturas podem continuar gerando cobranças no Asaas.
-- Idempotente. Rode DEPOIS do 009. Confira a prévia (passo 1) antes de executar o passo 2.

-- Passo 1: prévia (somente leitura)
SELECT s.id, s.business_id, s.gateway_subscription_id, s.ended_at
FROM subscriptions s
WHERE s.status = 'expired'
  AND s.gateway_subscription_id IS NOT NULL
  AND s.gateway_cancel_status IS NULL
  AND s.cancel_at_period_end = false
  AND NOT EXISTS (
    SELECT 1 FROM billing_transactions t
    WHERE t.subscription_id = s.id AND t.status IN ('approved', 'refunded')
  );

-- Passo 2: enfileira (o próximo cron faz o cancelamento no Asaas)
UPDATE subscriptions s
SET gateway_cancel_status = 'pending', updated_at = now()
WHERE s.status = 'expired'
  AND s.gateway_subscription_id IS NOT NULL
  AND s.gateway_cancel_status IS NULL
  AND s.cancel_at_period_end = false
  AND NOT EXISTS (
    SELECT 1 FROM billing_transactions t
    WHERE t.subscription_id = s.id AND t.status IN ('approved', 'refunded')
  );
