# Notificações push (Web Push)

Avisos nativos no celular/computador para novo agendamento, cancelamento, reagendamento e lembrete, mesmo com o MARCAÍ fechado. Sem dependências nem serviços pagos: Web Push padrão (VAPID + criptografia `aes128gcm`) implementado com `node:crypto`.

## Configuração

1. Gere um par de chaves VAPID (uma vez):

   ```bash
   npx tsx -e "import { generateVapidKeys } from './lib/push/web-push'; console.log(generateVapidKeys())"
   ```

2. Cadastre as variáveis no projeto Vercel (Settings > Environment Variables):

   | Variável | Valor |
   | --- | --- |
   | `VAPID_PUBLIC_KEY` | chave pública gerada |
   | `VAPID_PRIVATE_KEY` | chave privada gerada (nunca vai para o navegador) |
   | `VAPID_SUBJECT` | `mailto:contato@seudominio.com.br` |

   Sem essas variáveis o recurso fica desativado: nada é enfileirado e a tela de configurações informa que o push não está disponível.

3. Aplique a migration `scripts/017-notificacoes-push.sql` no banco (manual, fora deste PR).

## Processamento da fila

Cada evento grava uma entrega `pending` por dispositivo **antes** do envio (idempotente por `subscription_id + dedupe_key`). O envio é tentado logo após a resposta da ação e, se falhar, pela rota de reprocessamento:

- `GET /api/cron/push` com `Authorization: Bearer CRON_SECRET`.

Como o plano Hobby da Vercel não permite crons frequentes, agende essa rota a cada 5 minutos no mesmo agendador externo gratuito usado para o WhatsApp (ex.: cron-job.org), com o mesmo cabeçalho. A rota também gera os lembretes de atendimentos próximos.

## Comportamento

- Tentativas: até 5, com backoff de 1, 5, 15 e 60 minutos para erros temporários (408, 429, 5xx, rede).
- Expiração: avisos de agenda expiram em 24 h; lembretes, no início do atendimento.
- Inscrição vencida (404/410): é revogada automaticamente.
- Preferências, vínculo do membro e permissão de ver o agendamento são conferidos de novo no envio.
- Ao tocar na notificação, o painel abre em `/painel/agendamentos?agendamento=<id>`.
- O sino interno continua sendo a fonte de registro; o push não cria registros duplicados.
