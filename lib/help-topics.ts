export interface HelpTopic {
  key: string
  title: string
  /** Uma frase curta: para que serve. */
  intro: string
  /** Passos objetivos, no máximo 3. */
  howTo: string[]
  example?: string
  panelHref: string
}

/** Conteúdo único usado pelo assistente, pelas dicas contextuais e pela Central de Ajuda. */
export const HELP_TOPICS = {
  business: {
    key: "business",
    title: "Dados da loja",
    intro: "É como seus clientes reconhecem o seu negócio.",
    howTo: [
      "Escreva o nome que o cliente conhece.",
      "Coloque um telefone com DDD e o endereço.",
      "Se quiser, adicione logo e cor.",
    ],
    example: "Barbearia do Centro · (11) 98888-7777",
    panelHref: "/painel/configuracoes",
  },
  hours: {
    key: "hours",
    title: "Horários de funcionamento",
    intro: "O cliente só consegue marcar dentro desses horários.",
    howTo: [
      "Ligue os dias em que você atende.",
      "Informe a hora de abrir e de fechar.",
      "Tem almoço? Preencha a pausa.",
    ],
    example: "Seg a sex, 9h às 19h, pausa das 12h às 13h.",
    panelHref: "/painel/configuracoes",
  },
  services: {
    key: "services",
    title: "Serviços",
    intro: "É o que o cliente pode agendar.",
    howTo: [
      "Dê um nome ao serviço.",
      "Informe o preço e quanto tempo ele leva.",
      "Ligue o serviço a quem faz o atendimento.",
    ],
    example: "Corte masculino · R$ 45 · 30 min",
    panelHref: "/painel/servicos",
  },
  professionals: {
    key: "professionals",
    title: "Profissionais",
    intro: "São as pessoas que atendem os clientes.",
    howTo: [
      "Se você atende, toque em \"Sou eu\".",
      "Marque os serviços que a pessoa faz.",
      "Confira os dias e horários de trabalho.",
    ],
    example: "Ana · Corte e coloração · Ter a sáb",
    panelHref: "/painel/profissionais",
  },
  rules: {
    key: "rules",
    title: "Regras de agendamento",
    intro: "Definem como os horários livres aparecem.",
    howTo: [
      "Escolha de quanto em quanto tempo os horários aparecem.",
      "Escolha o prazo mínimo para o cliente marcar.",
    ],
    example: "Horários a cada 15 min, marcando com 1h de antecedência.",
    panelHref: "/painel/configuracoes",
  },
  page: {
    key: "page",
    title: "Página pública",
    intro: "É o link que seus clientes usam para agendar sozinhos.",
    howTo: [
      "Escolha um endereço curto e fácil.",
      "Escreva uma frase sobre o seu negócio.",
      "Compartilhe o link no WhatsApp e no Instagram.",
    ],
    example: "marcai.app/agendar/barbearia-do-centro",
    panelHref: "/painel/pagina-de-agendamento",
  },
} satisfies Record<string, HelpTopic>

export type HelpTopicKey = keyof typeof HELP_TOPICS

export const HELP_TOPIC_LIST: HelpTopic[] = Object.values(HELP_TOPICS)
