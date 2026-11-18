import "server-only"

import { headers } from "next/headers"

import { resolveSiteUrl } from "@/lib/site-url"

export async function getSiteUrl() {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host")
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https")
  return resolveSiteUrl(process.env, host ? `${proto}://${host}` : null)
}
