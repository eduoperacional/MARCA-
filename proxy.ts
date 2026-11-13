import { getSessionCookie } from "better-auth/cookies"
import { NextResponse, type NextRequest } from "next/server"

const AUTH_PAGES = ["/entrar", "/cadastro"]

// Optimistic check only: every page and action still validates the session on the server.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const hasSession = Boolean(getSessionCookie(request))

  if (!hasSession && (pathname.startsWith("/painel") || pathname.startsWith("/onboarding"))) {
    const url = new URL("/entrar", request.url)
    url.searchParams.set("redirect", `${pathname}${search}`)
    return NextResponse.redirect(url)
  }
  if (hasSession && AUTH_PAGES.includes(pathname) && !request.nextUrl.searchParams.has("redirect")) {
    return NextResponse.redirect(new URL("/painel", request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/painel/:path*", "/onboarding/:path*", "/entrar", "/cadastro"],
}
