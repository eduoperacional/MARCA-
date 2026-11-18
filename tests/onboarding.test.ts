import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { parseCurrencyInput } from "../lib/currency-input"
import { bookingUrl } from "../lib/site-url"
import { validateWeekSchedule } from "../lib/schedule"

const validWeek = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  active: weekday === 1,
  start: "09:00",
  end: "18:00",
  breakStart: weekday === 1 ? "12:00" : null,
  breakEnd: weekday === 1 ? "13:00" : null,
}))

describe("entrada e validação do onboarding", () => {
  test("converte valores em formato brasileiro ou decimal sem multiplicar pontos", () => {
    assert.equal(parseCurrencyInput("45,00"), 45)
    assert.equal(parseCurrencyInput("45.00"), 45)
    assert.equal(parseCurrencyInput("999999.99"), 999999.99)
    assert.equal(parseCurrencyInput("45.000"), null)
    assert.equal(parseCurrencyInput("-45,00"), null)
    assert.equal(parseCurrencyInput(""), null)
  })

  test("aceita semana completa válida e rejeita dias duplicados ou inválidos", () => {
    assert.equal(validateWeekSchedule(validWeek), null)
    assert.equal(validateWeekSchedule([null, ...validWeek.slice(1)]), "Horários inválidos.")
    assert.equal(
      validateWeekSchedule([...validWeek.slice(0, 6), { ...validWeek[5], weekday: 5 }]),
      "Horários inválidos.",
    )
  })

  test("gera link público de agendamento a partir do slug salvo", () => {
    assert.equal(bookingUrl("https://marcaiapp.vercel.app/", "studio-bella"), "https://marcaiapp.vercel.app/agendar/studio-bella")
  })
})
