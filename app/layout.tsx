import type { Metadata, Viewport } from "next"
import { Inter, Sora } from "next/font/google"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "MARCAÍ — Agenda e gestão de atendimentos",
    template: "%s · MARCAÍ",
  },
  description:
    "Plataforma de agendamento online e gestão de atendimentos para barbearias, salões, clínicas, estúdios e profissionais autônomos.",
  applicationName: "MARCAÍ",
}

export const viewport: Viewport = {
  themeColor: "#0B0B12",
  colorScheme: "dark",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`dark ${inter.variable} ${sora.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster theme="dark" position="top-right" />
      </body>
    </html>
  )
}
