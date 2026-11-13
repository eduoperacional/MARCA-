import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ModulePlaceholder } from "@/components/modules/module-placeholder"
import { NAV_ITEMS, getModuleBySlug } from "@/config/navigation"

const PLACEHOLDER_MODULES = new Set(["/painel/marketing", "/painel/ajuda"])

export function generateStaticParams() {
  return NAV_ITEMS.filter((item) => PLACEHOLDER_MODULES.has(item.href)).map((item) => ({
    module: item.href.replace("/painel/", ""),
  }))
}

export async function generateMetadata({
  params,
}: PageProps<"/painel/[module]">): Promise<Metadata> {
  const { module } = await params
  const item = getModuleBySlug(module)
  return { title: item?.title ?? "Página não encontrada" }
}

export default async function ModulePage({ params }: PageProps<"/painel/[module]">) {
  const { module } = await params
  const item = getModuleBySlug(module)
  if (!item) notFound()

  return (
    <ModulePlaceholder
      href={item.href}
    />
  )
}
