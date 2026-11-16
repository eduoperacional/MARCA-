export interface HelpTopic {
  key: string
  title: string
  intro: string
  howTo: string[]
  example: string
  panelHref?: string
}

/** Conteúdo único usado pelo assistente, pelas dicas contextuais e pela Central de Ajuda. */
export const HELP_TOPICS = {
  business: {
    key: "business",
    title: "Dados do estabelecimento",
    intro: "São as informações que identificam seu negócio para os clientes na página de agendamento e nas mensagens.",
    howTo: [
      "Use o nome comercial, como o cliente conhece o seu negócio.",
      "Informe um telefone com DDD que receba ligações ou WhatsApp.",
      "O endereço aparece na página pública para o cliente chegar até você.",
      "Logo e cor principal são opcionais e personalizam sua página.",
    ],
    example: "Barbearia do Centro · Barbearia · (11) 98888-7777 · Rua das Flores, 120 · São Paulo/SP",
    panelHref: "/painel/configuracoes",
  },
  hours: {
    key: "hours",
    title: "Funcionamento",
    intro: "Os horários de funcionamento limitam quando os clientes podem agendar. Fora deles, nenhum horário é oferecido.",
    howTo: [
      "Ative apenas os dias em que você atende. Dias desativados são folgas fixas.",
      "Use a pausa para o almoço ou intervalos fixos; nenhum horário é oferecido nela.",
      "Para folgas em datas específicas (feriados, férias), use os bloqueios da Agenda.",
    ],
    example: "Segunda a sexta, 09:00 às 19:00, pausa das 12:00 às 13:00. Sábado, 09:00 às 14:00. Domingo fechado.",
    panelHref: "/painel/configuracoes",
  },
  services: {
    key: "services",
    title: "Serviços",
    intro: "Cada serviço define o que o cliente pode agendar, quanto custa e quanto tempo ocupa da agenda.",
    howTo: [
      "Duração: o tempo real do atendimento, incluindo preparo. É ela que reserva o horário na agenda.",
      "Preço: o valor exibido ao cliente. Use 0 para serviços gratuitos ou de avaliação.",
      "Disponibilidade: o serviço só aparece para agendamento quando está ativo e vinculado a pelo menos um profissional.",
      "Categorias agrupam serviços parecidos na página pública.",
    ],
    example: "Corte masculino · Cabelo · R$ 45,00 · 30 minutos",
    panelHref: "/painel/servicos",
  },
  professionals: {
    key: "professionals",
    title: "Profissionais",
    intro: "Profissionais são quem atende. A agenda de cada um combina os dias de trabalho dele com os serviços vinculados.",
    howTo: [
      "Se você mesmo atende, cadastre-se como profissional e use o botão \"Sou eu\".",
      "Marque os serviços que cada profissional realiza; sem vínculo, ninguém consegue agendar com ele.",
      "Os dias de trabalho do profissional precisam estar dentro do funcionamento do estabelecimento.",
      "Especialidades são exibidas na página pública e ajudam o cliente a escolher.",
    ],
    example: "Ana Souza · Coloração e cortes femininos · Terça a sábado, 10:00 às 19:00",
    panelHref: "/painel/profissionais",
  },
  rules: {
    key: "rules",
    title: "Regras de agendamento",
    intro: "As regras definem como os horários livres são oferecidos aos clientes.",
    howTo: [
      "Intervalo entre horários: de quanto em quanto tempo os horários aparecem (ex.: 09:00, 09:15, 09:30).",
      "Antecedência mínima: evita marcações de última hora que você não consegue atender.",
      "Cancelamentos e remarcações são feitos pela equipe na Agenda ou em Agendamentos, e o cliente é avisado quando as mensagens automáticas estão ativas.",
    ],
    example: "Horários a cada 15 minutos, com antecedência mínima de 1 hora.",
    panelHref: "/painel/configuracoes",
  },
  page: {
    key: "page",
    title: "Página pública",
    intro: "É o link que você divulga para os clientes agendarem sozinhos, 24 horas por dia.",
    howTo: [
      "Escolha um endereço curto e fácil de digitar, com letras, números e hífens.",
      "Escreva uma descrição curta: o que você faz e um diferencial.",
      "Com o agendamento online ativo, a página aceita marcações imediatamente.",
      "Divulgue o link no Instagram, no WhatsApp Business e no Google.",
    ],
    example: "marcai.app/agendar/barbearia-do-centro · \"Cortes e barba com hora marcada, no centro de São Paulo.\"",
    panelHref: "/painel/pagina-de-agendamento",
  },
} satisfies Record<string, HelpTopic>

export type HelpTopicKey = keyof typeof HELP_TOPICS

export const HELP_TOPIC_LIST: HelpTopic[] = Object.values(HELP_TOPICS)
