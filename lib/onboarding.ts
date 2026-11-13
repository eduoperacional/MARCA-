export const BUSINESS_SEGMENTS = [
  { value: "barbearia", label: "Barbearia" },
  { value: "salao", label: "Salão de beleza" },
  { value: "clinica", label: "Clínica" },
  { value: "estetica", label: "Manicure e estética" },
  { value: "tatuagem", label: "Tatuagem" },
  { value: "massagem", label: "Massagem" },
  { value: "personal", label: "Personal trainer" },
  { value: "outros", label: "Outros serviços com agendamento" },
] as const

export const BRAZIL_STATES = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ")

export const ONBOARDING_STEPS = [
  { step: 1, title: "Estabelecimento", description: "Dados do seu negócio" },
  { step: 2, title: "Identidade", description: "Marca e página pública" },
  { step: 3, title: "Funcionamento", description: "Dias e horários" },
  { step: 4, title: "Serviço", description: "O que você oferece" },
  { step: 5, title: "Profissional", description: "Quem atende" },
] as const

export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
