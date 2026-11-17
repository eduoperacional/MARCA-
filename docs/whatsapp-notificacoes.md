# Notificações por WhatsApp para o proprietário

O proprietário recebe no próprio WhatsApp os avisos de **novo agendamento**, **cancelamento** e **reagendamento**, pela API oficial da Meta (WhatsApp Cloud API). Os clientes finais não recebem mensagens por este recurso.

## Tabelas (script `scripts/015-notificacoes-whatsapp.sql`)

- `business_whatsapp_settings`: uma linha por estabelecimento, com o número de destino, `enabled`, `consent_at` e as preferências por evento.
- `whatsapp_deliveries`: a fila persistente. Cada aviso vira uma linha com status, tentativas, último erro e chave de idempotência.

Todas as consultas filtram por `business_id` do estabelecimento ativo da sessão.

## Consentimento

- Nenhum número é copiado de `businesses.phone`.
- Novos registros começam com `enabled = false`.
- O envio só acontece quando o proprietário cadastra o número e ativa voluntariamente; nesse momento `consent_at` é gravado.
- Uma `CHECK` no banco impede `enabled = true` sem número e sem `consent_at`.
- O consentimento é conferido de novo no momento do envio. Se o proprietário desativar, os avisos pendentes são encerrados como `skipped`.

## Telefone

Uma única função, `normalizeWhatsappPhone` (`lib/phone.ts`), é usada no onboarding, nas configurações e no envio. O número é armazenado só com dígitos, DDD + número, sem o 55 (por exemplo, `11988887777`). O 55 é adicionado apenas na chamada à Meta.

## Fila, tentativas e idempotência

1. Quando ocorre o evento, o aviso é gravado em `whatsapp_deliveries` com status `pending`, **antes** de qualquer chamada à Meta.
2. Logo após a resposta da requisição (`after()`), o sistema tenta enviar esse aviso.
3. O cron `/api/cron/whatsapp` (a cada 5 minutos, protegido por `CRON_SECRET`) reprocessa o que ficou pendente. A entrega não depende de `after()`.
4. A reserva usa `FOR UPDATE SKIP LOCKED` e um bloqueio de 2 minutos: dois processos nunca enviam a mesma linha, e uma linha interrompida no meio volta a ser elegível.
5. Falhas temporárias (HTTP 408/429/5xx, limites da Meta, erros de rede) ganham nova tentativa com backoff progressivo: 1, 5, 15 e 60 minutos. O limite é de 5 tentativas.
6. Falhas permanentes (template não aprovado, número inválido, credencial inválida) vão direto para `failed`.
7. Um aviso que não saiu em 24 horas é encerrado como `failed`.
8. O proprietário pode reenviar uma falha em **Configurações > Notificações**.

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
4. Fazer o deploy. O cron em `vercel.json` passa a processar a fila.
5. Em Configurações > Notificações, cadastrar o número, ativar e usar "Enviar teste".
