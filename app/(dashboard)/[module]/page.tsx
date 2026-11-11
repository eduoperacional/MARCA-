import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ModulePlaceholder } from "@/components/modules/module-placeholder"
import { NAV_ITEMS, getModuleBySlug } from "@/config/navigation"

export function generateStaticParams() {
  return NAV_ITEMS.filter((item) => item.href !== "/").map((item) => ({
    module: item.href.slice(1),
  }))
}

export async function generateMetadata({
  params,
}: PageProps<"/[module]">): Promise<Metadata> {
  const { module } = await params
  const item = getModuleBySlug(module)
  return { title: item?.title ?? "Página não encontrada" }
}

export default async function ModulePage({ params }: PageProps<"/[module]">) {
  const { module } = await params
  const item = getModuleBySlug(module)
  if (!item) notFound()

  return (
    <ModulePlaceholder
      href={item.href}
    />
  )
}
