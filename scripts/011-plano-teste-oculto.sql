-- 011 - Plano de teste interno oculto (R$ 5,00, cobrança única e imediata).
-- Idempotente. Rode DEPOIS da 010. Não altera Start, Pro e Elite (mensais ou anuais).
--
-- Visibilidade: o plano só aparece e só pode ser contratado por e-mails listados em
-- BILLING_TEST_EMAILS (validação no servidor). Desativar: UPDATE plans SET is_active = false
-- WHERE code = 'teste-5'; (não apague a linha: assinaturas e cobranças do teste apontam para ela).
BEGIN;

ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_test   boolean NOT NULL DEFAULT false;

INSERT INTO plans (code, name, description, price_cents, billing_interval, trial_days,
                   features, limits, is_active, sort_order, family, is_recommended, is_hidden, is_test)
SELECT 'teste-5', 'Teste interno',
       'Plano temporário para validar a contratação. Cobrança única e imediata, sem período grátis.',
       500, 'month', 0, p.features, p.limits, true, 999, 'teste', false, true, true
FROM plans p
WHERE p.code = 'start'
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- Conferência: Start/Pro/Elite devem manter os mesmos preços; só 'teste-5' tem is_test = true.
SELECT code, name, price_cents, billing_interval, is_active, is_hidden, is_test
FROM plans ORDER BY sort_order, billing_interval;
