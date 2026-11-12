// @ts-nocheck -- port direto de scripts/seed.mjs, usado apenas no banco local de demonstração.
import "server-only"

interface SqlClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

let seed = 42
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const pick = (list) => list[Math.floor(rand() * list.length)]

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})
const localNow = () => {
  const p = Object.fromEntries(partsFormatter.formatToParts(new Date()).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) }
}
const addDays = (date, days) => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const weekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay()
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
const instant = (date, minutes) => new Date(`${date}T${toTime(minutes)}:00-03:00`)

const week = (days, start, end, breakStart, breakEnd) =>
  Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    active: days.includes(weekday),
    start,
    end: weekday === 6 ? "17:00" : end,
    breakStart,
    breakEnd,
  }))

const OPENING_HOURS = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  active: weekday !== 0,
  start: "09:00",
  end: weekday === 6 ? "17:00" : "19:00",
  breakStart: null,
  breakEnd: null,
}))

const PROFESSIONALS = [
  { key: "rafael", name: "Rafael Souza", specialties: "Barbeiro sênior · Cortes clássicos", color: "#7B3FF2", phone: "(11) 98811-2030", schedule: week([1, 2, 3, 4, 5, 6], "09:00", "19:00", "12:00", "13:00") },
  { key: "lucas", name: "Lucas Andrade", specialties: "Barbeiro · Degradê e barba", color: "#3B82F6", phone: "(11) 97722-1450", schedule: week([1, 2, 3, 4, 5, 6], "09:00", "18:00", "13:00", "14:00") },
  { key: "mateus", name: "Mateus Oliveira", specialties: "Barbeiro e colorista", color: "#22C55E", phone: "(11) 96633-8721", schedule: week([2, 3, 4, 5, 6], "10:00", "19:00", "13:00", "14:00") },
  { key: "bruno", name: "Bruno Lima", specialties: "Barbeiro · Infantil e acabamento", color: "#F59E0B", phone: "(11) 95544-3098", schedule: week([1, 3, 4, 5, 6], "09:00", "18:00", "12:30", "13:30") },
]

const SERVICES = [
  { key: "corte", name: "Corte masculino", category: "Cabelo", price: 4500, duration: 40, weight: 34, pros: ["rafael", "lucas", "mateus", "bruno"] },
  { key: "barba", name: "Barba completa", category: "Barba", price: 3500, duration: 30, weight: 16, pros: ["rafael", "lucas", "bruno"] },
  { key: "combo", name: "Corte + barba", category: "Combos", price: 7000, duration: 60, weight: 24, pros: ["rafael", "lucas", "mateus", "bruno"] },
  { key: "infantil", name: "Corte infantil", category: "Cabelo", price: 3500, duration: 30, weight: 7, pros: ["bruno", "lucas"] },
  { key: "pigmentacao", name: "Pigmentação de barba", category: "Barba", price: 6000, duration: 45, weight: 6, pros: ["mateus", "rafael"] },
  { key: "sobrancelha", name: "Sobrancelha na navalha", category: "Acabamento", price: 2000, duration: 15, weight: 6, pros: ["rafael", "lucas", "mateus", "bruno"] },
  { key: "hidratacao", name: "Hidratação capilar", category: "Tratamentos", price: 4000, duration: 30, weight: 4, pros: ["mateus"] },
  { key: "platinado", name: "Platinado", category: "Coloração", price: 15000, duration: 120, weight: 3, pros: ["mateus"] },
]

const CLIENT_NAMES = [
  "João Pereira", "Pedro Henrique", "Gabriel Costa", "André Martins", "Felipe Rocha", "Thiago Alves",
  "Gustavo Ribeiro", "Rodrigo Nunes", "Eduardo Carvalho", "Leonardo Gomes", "Vinícius Barros", "Diego Fernandes",
  "Marcelo Teixeira", "Ricardo Moreira", "Caio Lopes", "Daniel Freitas", "Igor Cardoso", "Henrique Dias",
  "Paulo Vieira", "Fábio Correia", "Renato Pinto", "Samuel Araújo", "Otávio Mendes", "Murilo Castro",
  "Arthur Monteiro", "Heitor Batista", "Enzo Farias", "Miguel Duarte", "Bernardo Reis", "Alexandre Campos",
  "Leandro Azevedo", "Wagner Santana",
]

export async function seedDemo(client: SqlClient) {
  try {
    await client.query("begin")

    const { rows: [business] } = await client.query(
      `insert into businesses (name, slug, segment, phone, address, opening_hours)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      ["Barbearia Vintage", "barbearia-vintage", "Barbearia", "(11) 3456-7890", "Rua Augusta, 1200 · Consolação, São Paulo - SP", JSON.stringify(OPENING_HOURS)]
    )
    const businessId = business.id

    const proIds = {}
    for (const p of PROFESSIONALS) {
      const email = `${p.key}@barbeariavintage.com.br`
      const { rows: [row] } = await client.query(
        `insert into professionals (business_id, name, phone, email, specialties, color, work_schedule)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [businessId, p.name, p.phone, email, p.specialties, p.color, JSON.stringify(p.schedule)]
      )
      proIds[p.key] = row.id
    }

    const serviceIds = {}
    for (const s of SERVICES) {
      const { rows: [row] } = await client.query(
        `insert into services (business_id, name, category, price_cents, duration_min) values ($1,$2,$3,$4,$5) returning id`,
        [businessId, s.name, s.category, s.price, s.duration]
      )
      serviceIds[s.key] = row.id
      for (const key of s.pros) {
        await client.query("insert into professional_services values ($1,$2)", [proIds[key], row.id])
      }
    }

    const { date: today, minutes: nowMinutes } = localNow()
    const clientIds = []
    for (const [index, name] of CLIENT_NAMES.entries()) {
      const digits = `119${String(80000000 + index * 271_337).slice(0, 8)}`
      const phone = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
      const createdAt = instant(addDays(today, -Math.floor(rand() * 120) - 5), 10 * 60)
      const { rows: [row] } = await client.query(
        `insert into clients (business_id, name, phone, phone_normalized, email, created_at) values ($1,$2,$3,$4,$5,$6) returning id`,
        [businessId, name, phone, digits, rand() > 0.5 ? `${name.split(" ")[0].toLowerCase()}@email.com` : null, createdAt]
      )
      clientIds.push(row.id)
    }
    // Clientes fiéis aparecem com mais frequência.
    const weightedClients = clientIds.flatMap((id, index) => Array(index < 10 ? 4 : index < 22 ? 2 : 1).fill(id))
    const weightedServices = SERVICES.flatMap((s) => Array(s.weight).fill(s))

    let created = 0
    for (let offset = -60; offset <= 14; offset++) {
      const date = addDays(today, offset)
      const wd = weekday(date)
      if (!OPENING_HOURS[wd].active) continue

      for (const p of PROFESSIONALS) {
        const day = p.schedule[wd]
        if (!day.active) continue
        const fill = offset > 7 ? 0.25 : offset > 0 ? 0.55 : 0.72
        let cursor = toMin(day.start)
        const end = toMin(day.end)
        const bs = toMin(day.breakStart)
        const be = toMin(day.breakEnd)

        while (cursor < end) {
          if (cursor >= bs && cursor < be) { cursor = be; continue }
          if (rand() > fill) { cursor += 30; continue }
          const options = weightedServices.filter((s) => s.pros.includes(p.key))
          const service = pick(options)
          const finish = cursor + service.duration
          if (finish > end || (cursor < bs && finish > bs)) { cursor += 15; continue }

          let status
          const isPast = offset < 0 || (offset === 0 && finish <= nowMinutes)
          const isCurrent = offset === 0 && cursor <= nowMinutes && finish > nowMinutes
          const r = rand()
          if (isPast) status = r < 0.86 ? "completed" : r < 0.94 ? "cancelled" : "no_show"
          else if (isCurrent) status = "in_progress"
          else status = r < 0.6 ? "confirmed" : r < 0.95 ? "pending" : "cancelled"

          const source = rand() < 0.3 ? "online" : "admin"
          const method = pick(["pix", "pix", "pix", "credit", "debit", "cash"])
          const startsAt = instant(date, cursor)
          const endsAt = instant(date, finish)
          const createdAt = new Date(startsAt.getTime() - (1 + Math.floor(rand() * 6)) * 86_400_000)

          const { rows: [appt] } = await client.query(
            `insert into appointments (business_id, client_id, service_id, professional_id, starts_at, ends_at, price_cents, payment_method, status, source, created_at, updated_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) returning id`,
            [businessId, pick(weightedClients), serviceIds[service.key], proIds[p.key], startsAt, endsAt, service.price, status === "completed" ? method : null, status, source, createdAt]
          )
          if (status === "completed" && rand() < 0.95) {
            await client.query(
              `insert into payments (business_id, appointment_id, amount_cents, method, paid_at) values ($1,$2,$3,$4,$5)`,
              [businessId, appt.id, service.price, method, endsAt]
            )
          }
          created++
          cursor = finish + (rand() < 0.4 ? 15 : 0)
        }
      }
    }

    const EXPENSES = [
      ["Aluguel do salão", "Aluguel", 450000, 5],
      ["Conta de energia", "Contas", 68000, 10],
      ["Internet e telefone", "Contas", 19000, 12],
      ["Produtos (pomadas, óleos, lâminas)", "Produtos", 92000, 8],
      ["Marketing no Instagram", "Marketing", 30000, 15],
      ["Manutenção de máquinas", "Manutenção", 25000, 20],
    ]
    for (const monthOffset of [0, 1, 2]) {
      const base = new Date(`${today.slice(0, 7)}-01T12:00:00Z`)
      base.setUTCMonth(base.getUTCMonth() - monthOffset)
      for (const [description, category, amount, day] of EXPENSES) {
        const date = `${base.toISOString().slice(0, 7)}-${String(day).padStart(2, "0")}`
        if (date > today) continue
        await client.query(
          `insert into expenses (business_id, description, category, amount_cents, date) values ($1,$2,$3,$4,$5)`,
          [businessId, description, category, Math.round(amount * (0.9 + rand() * 0.2)), date]
        )
      }
    }

    const nextDay = addDays(today, 1)
    await client.query(
      `insert into time_blocks (business_id, professional_id, starts_at, ends_at, reason) values ($1,$2,$3,$4,$5)`,
      [businessId, proIds.mateus, instant(nextDay, 17 * 60), instant(nextDay, 19 * 60), "Curso de coloração"]
    )

    const { rows: recentOnline } = await client.query(
      `select a.id, c.name as client, s.name as service, a.starts_at from appointments a
       join clients c on c.id = a.client_id join services s on s.id = a.service_id
       where a.business_id = $1 and a.source = 'online' and a.starts_at > now() order by a.created_at desc limit 3`,
      [businessId]
    )
    for (const [index, a] of recentOnline.entries()) {
      await client.query(
        `insert into notifications (business_id, type, title, body, appointment_id, created_at) values ($1,'appointment_created',$2,$3,$4,$5)`,
        [businessId, "Novo agendamento online", `${a.client} agendou ${a.service}.`, a.id, new Date(Date.now() - (index + 1) * 47 * 60_000)]
      )
    }

    await client.query("commit")
    return created
  } catch (error) {
    await client.query("rollback")
    throw error
  }
}
