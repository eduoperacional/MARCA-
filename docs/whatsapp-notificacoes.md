# Notificações por WhatsApp para o proprietário

O proprietário recebe no próprio WhatsApp os avisos de **novo agendamento**, **cancelamento** e **reagendamento**, pela API oficial da Meta (WhatsApp Cloud API). Os clientes finais não recebem mensagens por este recurso.

## Tabelas (script `scripts/015-notificacoes-whatsapp.sql`)

- `business_whatsapp_settings`: uma linha por estabelecimento, com o número de destino, `enabled`, `consent_at` e as preferências por evento.
- `whatsapp_deliveries`: a fila persistente. Cada aviso vira uma linha com status, tentativas, último erro e chave de idempotência.

Todas as consultas filtram por `business_id` do estabelecimento ativo da sessão.

O script é idempotente e **não apaga registros**. Na atualização a partir da versão anterior:

- Configurações criadas pela cópia automática de `businesses.phone` (nunca editadas nem testadas) são desativadas e têm o telefone limpo por `UPDATE`; a linha é preservada.
- Configurações sem `consent_at` são desativadas.
- Pendências antigas com validade de 24 h passam a valer 7 dias a partir da criação.
- O histórico em `whatsapp_deliveries` é mantido integralmente.

## Consentimento

- Nenhum número é copiado de `businesses.phone`.
- Novos registros começam com `enabled = false`.
- O envio só acontece quando o proprietário cadastra o número e ativa voluntariamente; nesse momento `consent_at` é gravado.
- Uma `CHECK` no banco impede `enabled = true` sem número e sem `consent_at`.
- O consentimento é conferido de novo no momento do envio. Se o proprietário desativar, os avisos pendentes são encerrados como `skipped`.

## Telefone

Uma única função, `normalizeWhatsappPhone` (`lib/phone.ts`), é usada no onboarding, nas configurações e no envio. O número é armazenado só com dígitos, DDD + número, sem o 55 (por exemplo, `11988887777`). O 55 é adicionado apenas na chamada à Meta.

## Fila, tentativas e idempotência

O projeto está no **Vercel Hobby**, que só permite cron **uma vez por dia**. Por isso o envio normal é imediato, e a recuperação da fila é disparada por um **agendador externo gratuito** (por exemplo, cron-job.org) a cada 5 minutos. O `vercel.json` mantém apenas o cron de cobrança Asaas.

**Configuração do agendador externo:**

- URL: `https://<domínio-de-produção>/api/cron/whatsapp`
- Método: `GET`
- Cabeçalho: `Authorization: Bearer <CRON_SECRET>` (mesmo valor da variável `CRON_SECRET` do projeto)
- Intervalo: a cada 5 minutos (`*/5 * * * *`)
- Timeout: pelo menos 60 segundos (a rota processa por até 45 s)

Sem o cabeçalho correto, ou sem `CRON_SECRET` configurado, a rota responde `401`. Chamadas sobrepostas são seguras: a reserva com `FOR UPDATE SKIP LOCKED` e o bloqueio de 2 minutos impedem que a mesma linha seja enviada duas vezes.

1. Quando ocorre o evento (criar, cancelar ou reagendar), o aviso é gravado em `whatsapp_deliveries` com status `pending`, **antes** de qualquer chamada à Meta.
2. **Envio imediato:** logo após a resposta da requisição (`after()`), o sistema reserva essa linha pelo id e chama a Meta Cloud API. No caso comum, o proprietário recebe o aviso em segundos, sem depender do cron.
3. **Recuperação:** a rota `/api/cron/whatsapp` é chamada pelo agendador externo a cada 5 minutos, protegida por `CRON_SECRET`. Ele processa, em lotes de 50 por até 45 segundos, as pendências de falhas temporárias e as entregas interrompidas.
4. **Tentativas:** 1 imediata + até 4 nas execuções diárias do cron (5 no total). Após uma falha temporária (HTTP 408/429/5xx, limites da Meta, erros de rede), a próxima tentativa fica elegível depois de 20 horas, valor abaixo de 24 h para que a pendência já esteja pronta na execução seguinte do cron. Não há novas tentativas em minutos.
5. Falhas permanentes (template não aprovado, número inválido, credencial inválida) vão direto para `failed`.
6. **Validade:** um aviso pendente expira em **7 dias**, prazo que cobre todas as tentativas diárias. Ao expirar, é encerrado como `failed`.
7. O proprietário pode reenviar uma falha em **Configurações > Notificações**. O reenvio volta a linha para `pending` e ela é tentada na próxima execução do cron.

**Prevenção de duplicidade entre envio imediato e cron:**

- A reserva é um `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)` que muda o status para `processing` e define um bloqueio de 2 minutos. Se o envio imediato e o cron disputarem a mesma linha, apenas um a reserva; o outro a ignora.
- Só são elegíveis linhas `pending` com `next_attempt_at` vencido, ou `processing` com o bloqueio expirado (processo interrompido). Linhas `sent`, `failed` e `skipped` nunca são reenviadas automaticamente.
- `markSent` só altera linhas ainda em `processing`.
- A chave de idempotência impede gravar o mesmo evento duas vezes.

**Limitações conhecidas (Hobby):**

- Se o envio imediato falhar temporariamente, a nova tentativa só fica elegível após o intervalo de 20 horas (`RETRY_DELAY_HOURS`); a frequência de 5 minutos não antecipa esse intervalo.
- Se a função for encerrada no meio do envio imediato, a linha fica em `processing` e é retomada pela primeira chamada do agendador após o bloqueio de 2 minutos expirar.
- Se o agendador externo ficar fora do ar, a recuperação para até ele voltar; o envio imediato continua funcionando.
- Existe uma janela rara: se a Meta aceitar a mensagem mas a função for encerrada antes de gravar `sent`, o cron pode reenviar. Nenhuma fila consegue eliminar esse caso sem confirmação da própria Meta.
- Os intervalos de tentativa e validade ficam em `lib/whatsapp/queue.ts` (`RETRY_DELAY_HOURS`, `DELIVERY_TTL_DAYS`).

**Chave de idempotência** (`UNIQUE (business_id, dedupe_key)`):

| Evento | Chave |
| --- | --- |
| Novo agendamento | `new_booking:<agendamento>` |
| Reagendamento | `reschedule:<agendamento>:<novo início>:<updated_at>` |
| Cancelamento | `cancellation:<agendamento>:<updated_at>` |

Reprocessar o mesmo evento gera a mesma chave e não duplica. Cada remarcação legítima grava um novo `updated_at` e gera um aviso distinto, inclusive quando o horário volta para um valor anterior.

## Sem credenciais

Sem `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`, nada é gravado na fila, o cron não reserva linhas e nenhuma tentativa é consumida. A tela informa que o envio está em ativação e os alertas continuam no sino do painel. Sem o script 015 executado, a tela mostra que o recurso não está disponível e o agendamento funciona normalmente.

Nenhuma falha do WhatsApp interrompe ou desfaz um agendamento.

## Modelos para aprovação na Meta

Categoria **Utility**, idioma **pt_BR**, 4 variáveis no máximo, nenhuma variável no início, no fim ou ao lado de outra.

**`marcai_novo_agendamento`**

```
Você recebeu um novo agendamento em {{1}}.

Cliente: {{2}}
Serviço: {{3}}
Data e horário: {{4}}

Os detalhes estão disponíveis no painel do MARCAÍ.
```

Exemplo: `Barbearia do Centro`, `Maria Silva`, `Corte feminino com João`, `20/11/2026 às 14:30`

**`marcai_cancelamento`**

```
Um agendamento foi cancelado em {{1}}.

Cliente: {{2}}
Serviço: {{3}}
Horário liberado: {{4}}

O horário já está disponível para novos agendamentos no MARCAÍ.
```

Exemplo: `Barbearia do Centro`, `Maria Silva`, `Corte feminino com João`, `20/11/2026 às 14:30`

**`marcai_reagendamento`**

```
Um agendamento foi remarcado em {{1}}.

Cliente: {{2}}
Serviço: {{3}}
Novo horário: {{4}}

Confira a agenda atualizada no painel do MARCAÍ.
```

Exemplo: `Barbearia do Centro`, `Maria Silva`, `Corte feminino com João`, `22/11/2026 às 10:00`

**`marcai_teste`**

```
Este é um teste do MARCAÍ. Os avisos de agendamento de {{1}} serão enviados para este número.

Se você não solicitou este teste, ignore esta mensagem.
```

Exemplo: `Barbearia do Centro`

## Ativação (etapa futura, não executada)

1. Executar `scripts/015-notificacoes-whatsapp.sql`.
2. Criar e aprovar os quatro modelos acima na Meta.
3. Configurar as variáveis de ambiente:
   - `WHATSAPP_ACCESS_TOKEN` (token de usuário do sistema, permanente)
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `CRON_SECRET` (já usado pelo cron de cobrança)
   - Opcionais: `WHATSAPP_API_VERSION` (padrão `v23.0`), `WHATSAPP_TEMPLATE_LANGUAGE` (padrão `pt_BR`), `WHATSAPP_TEMPLATE_NEW_BOOKING`, `WHATSAPP_TEMPLATE_CANCELLATION`, `WHATSAPP_TEMPLATE_RESCHEDULE`, `WHATSAPP_TEMPLATE_TEST`.
4. Fazer o deploy. O cron diário em `vercel.json` passa a recuperar as pendências. O Hobby aceita esse agendamento diário; frequências maiores fazem o deploy falhar no Hobby.
5. Em Configurações > Notificações, cadastrar o número, ativar e usar "Enviar teste".
