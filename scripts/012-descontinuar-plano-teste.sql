-- 012 - Descontinua o plano de teste interno (teste-5).
-- Idempotente. Rode DEPOIS da 011. Não altera preços, recursos nem limites de Start, Pro e Elite.
--
-- O plano deixa de aparecer e não pode mais ser contratado (o servidor também bloqueia planos
-- is_test). A linha não é apagada: assinaturas e cobranças antigas do teste apontam para ela.
-- Regra comercial nova: 7 dias grátis para todos, calculados no código a partir do cadastro.
BEGIN;

UPDATE plans
SET is_active = false, is_hidden = true
WHERE code = 'teste-5' AND (is_active OR NOT is_hidden);

COMMIT;

-- Conferência: só 'teste-5' deve aparecer com is_active = false.
SELECT code, name, price_cents, billing_interval, is_active, is_hidden, is_test
FROM plans ORDER BY sort_order, billing_interval;
