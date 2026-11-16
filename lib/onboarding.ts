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

export const SLOT_INTERVALS = [10, 15, 20, 30, 60]

export const MIN_ADVANCE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Sem antecedência" },
  { value: 30, label: "30 minutos" },
  { value: 60, label: "1 hora" },
  { value: 120, label: "2 horas" },
  { value: 240, label: "4 horas" },
  { value: 720, label: "12 horas" },
  { value: 1440, label: "1 dia" },
  { value: 2880, label: "2 dias" },
]

export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
