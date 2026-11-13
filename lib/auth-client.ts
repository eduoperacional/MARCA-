"use client"

import { inferAdditionalFields } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields({ user: { phone: { type: "string", required: false } } })],
})

export const { signIn, signUp, signOut, useSession } = authClient
