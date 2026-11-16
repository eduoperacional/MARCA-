# Notificações por WhatsApp (proprietário)

O MARCAÍ envia os avisos a partir de **um único número central**, usando a **WhatsApp Cloud API oficial da Meta**. O proprietário só informa o número dele (com DDD); qualquer número com WhatsApp ativo (comum ou Business) recebe.

Eventos: novo agendamento, cancelamento e reagendamento. O envio roda depois da resposta (`after()`), então uma falha nunca impede o agendamento. Cada tentativa fica registrada em `whatsapp_notification_logs`.

## O que falta para ativar os envios reais

1. **Banco**: executar `scripts/015-notificacoes-whatsapp.sql` (cria `business_whatsapp_settings` e `whatsapp_notification_logs`). Até lá, a tela mostra que o recurso não está disponível e nada quebra.
2. **Meta (uma vez, pelo MARCAÍ)**: conta no Meta Business Manager verificada, app com o produto WhatsApp, um número remetente do MARCAÍ e um token de **System User** permanente com `whatsapp_business_messaging`.
3. **Templates** (categoria Utility, idioma `pt_BR`), aprovados no WhatsApp Manager com o texto exato de `lib/whatsapp/templates.ts`:
   - `marcai_novo_agendamento`
   - `marcai_cancelamento`
   - `marcai_reagendamento`
   - `marcai_teste`
4. **Variáveis de ambiente** no projeto:

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | sim | Token permanente do System User |
| `WHATSAPP_PHONE_NUMBER_ID` | sim | ID do número remetente do MARCAÍ |
| `WHATSAPP_API_VERSION` | não | Versão da Graph API (padrão no código) |
| `WHATSAPP_TEMPLATE_LANGUAGE` | não | Padrão `pt_BR` |
| `WHATSAPP_TEMPLATE_NEW_BOOKING` / `_CANCELLATION` / `_RESCHEDULE` / `_TEST` | não | Sobrescrevem os nomes dos templates |

Sem as credenciais, nenhum envio é simulado: a tela informa que o provedor não está configurado e o log registra a tentativa como não enviada.

## Observações

- Mensagens iniciadas pela empresa fora da janela de 24h exigem template aprovado; por isso todos os avisos usam templates.
- A Meta cobra por conversa de utilidade; o custo é do MARCAÍ, não do proprietário.
