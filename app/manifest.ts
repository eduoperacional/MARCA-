import type { MetadataRoute } from "next"

/** Necessário para instalar o painel na Tela de Início (exigido pelo iOS para receber push). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MARCAÍ — Agenda e gestão",
    short_name: "MARCAÍ",
    description: "Agenda, agendamentos e avisos do seu estabelecimento.",
    start_url: "/painel",
    scope: "/",
    display: "standalone",
    background_color: "#0B0B12",
    theme_color: "#0B0B12",
    lang: "pt-BR",
    icons: [{ src: "/brand/marcai-icon.png", sizes: "any", type: "image/png", purpose: "any" }],
  }
}
