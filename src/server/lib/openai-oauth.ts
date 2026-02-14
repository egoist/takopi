import { randomBytes } from "node:crypto"
import { OPENAI_OAUTH_CLIENT_ID, OPENAI_OAUTH_ISSUER } from "@/lib/providers"

interface PendingDeviceAuthState {
  createdAt: number
  deviceAuthId: string
  userCode: string
  intervalMs: number
}

export interface OpenAITokenExchangeResult {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  accountId?: string
}

const pendingDeviceAuthStates = new Map<string, PendingDeviceAuthState>()
const PENDING_TTL_MS = 10 * 60 * 1000

function base64UrlEncode(value: Buffer) {
  return value.toString("base64url")
}

function generateState() {
  return base64UrlEncode(randomBytes(24))
}

function cleanupExpiredPending() {
  const now = Date.now()
  for (const [sessionId, pending] of pendingDeviceAuthStates.entries()) {
    if (now - pending.createdAt > PENDING_TTL_MS) {
      pendingDeviceAuthStates.delete(sessionId)
    }
  }
}

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8")) as Record<
      string,
      unknown
    >
  } catch {
    return null
  }
}

function getAccountIdFromClaims(claims: Record<string, unknown>) {
  const directAccountId = claims.chatgpt_account_id
  if (typeof directAccountId === "string" && directAccountId.length > 0) {
    return directAccountId
  }

  const scoped = claims["https://api.openai.com/auth"]
  if (scoped && typeof scoped === "object") {
    const scopedAccountId = (scoped as Record<string, unknown>).chatgpt_account_id
    if (typeof scopedAccountId === "string" && scopedAccountId.length > 0) {
      return scopedAccountId
    }
  }

  const organizations = claims.organizations
  if (Array.isArray(organizations) && organizations.length > 0) {
    const firstOrganization = organizations[0]
    if (firstOrganization && typeof firstOrganization === "object") {
      const organizationId = (firstOrganization as Record<string, unknown>).id
      if (typeof organizationId === "string" && organizationId.length > 0) {
        return organizationId
      }
    }
  }

  return undefined
}

function extractAccountId(idToken?: string, accessToken?: string) {
  if (idToken) {
    const claims = parseJwtClaims(idToken)
    if (claims) {
      const accountId = getAccountIdFromClaims(claims)
      if (accountId) return accountId
    }
  }

  if (accessToken) {
    const claims = parseJwtClaims(accessToken)
    if (claims) {
      return getAccountIdFromClaims(claims)
    }
  }

  return undefined
}

export interface OpenAIDeviceAuthStartResult {
  sessionId: string
  verificationUrl: string
  userCode: string
  intervalMs: number
}

export type OpenAIDeviceAuthPollResult =
  | { status: "pending"; intervalMs: number }
  | { status: "success"; token: OpenAITokenExchangeResult }
  | { status: "error"; error: string }

export async function startOpenAIDeviceAuth({
  providerId
}: {
  providerId: string
}): Promise<OpenAIDeviceAuthStartResult> {
  cleanupExpiredPending()

  const response = await fetch(`${OPENAI_OAUTH_ISSUER}/api/accounts/deviceauth/usercode`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: OPENAI_OAUTH_CLIENT_ID
    })
  })

  if (!response.ok) {
    throw new Error(`Failed to start device authorization (${response.status}).`)
  }

  const payload = (await response.json()) as {
    device_auth_id?: string
    user_code?: string
    interval?: string
  }

  if (!payload.device_auth_id || !payload.user_code) {
    throw new Error("Invalid device authorization response from OpenAI.")
  }

  const intervalMs = Math.max(Number.parseInt(payload.interval ?? "5", 10) || 5, 1) * 1000
  const sessionId = generateState()
  void providerId

  pendingDeviceAuthStates.set(sessionId, {
    createdAt: Date.now(),
    deviceAuthId: payload.device_auth_id,
    userCode: payload.user_code,
    intervalMs
  })

  return {
    sessionId,
    verificationUrl: `${OPENAI_OAUTH_ISSUER}/codex/device`,
    userCode: payload.user_code,
    intervalMs
  }
}

export async function pollOpenAIDeviceAuth({
  sessionId
}: {
  sessionId: string
}): Promise<OpenAIDeviceAuthPollResult> {
  cleanupExpiredPending()
  const session = pendingDeviceAuthStates.get(sessionId)

  if (!session) {
    return {
      status: "error",
      error: "OAuth session expired. Please start login again."
    }
  }

  const response = await fetch(`${OPENAI_OAUTH_ISSUER}/api/accounts/deviceauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      device_auth_id: session.deviceAuthId,
      user_code: session.userCode
    })
  })

  if (response.status === 403 || response.status === 404) {
    return {
      status: "pending",
      intervalMs: session.intervalMs
    }
  }

  if (!response.ok) {
    pendingDeviceAuthStates.delete(sessionId)
    return {
      status: "error",
      error: `Device authorization failed (${response.status}).`
    }
  }

  const devicePayload = (await response.json()) as {
    authorization_code?: string
    code_verifier?: string
  }

  if (!devicePayload.authorization_code || !devicePayload.code_verifier) {
    pendingDeviceAuthStates.delete(sessionId)
    return {
      status: "error",
      error: "Invalid device token response from OpenAI."
    }
  }

  const tokenResponse = await fetch(`${OPENAI_OAUTH_ISSUER}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: devicePayload.authorization_code,
      redirect_uri: `${OPENAI_OAUTH_ISSUER}/deviceauth/callback`,
      client_id: OPENAI_OAUTH_CLIENT_ID,
      code_verifier: devicePayload.code_verifier
    }).toString()
  })

  if (!tokenResponse.ok) {
    pendingDeviceAuthStates.delete(sessionId)
    return {
      status: "error",
      error: `Token exchange failed (${tokenResponse.status}).`
    }
  }

  const tokenPayload = (await tokenResponse.json()) as {
    access_token?: string
    refresh_token?: string
    id_token?: string
    expires_in?: number
  }

  if (!tokenPayload.access_token) {
    pendingDeviceAuthStates.delete(sessionId)
    return {
      status: "error",
      error: "Missing access token in OpenAI token response."
    }
  }

  pendingDeviceAuthStates.delete(sessionId)
  return {
    status: "success",
    token: {
      accessToken: tokenPayload.access_token,
      refreshToken: tokenPayload.refresh_token,
      expiresAt:
        typeof tokenPayload.expires_in === "number"
          ? Date.now() + tokenPayload.expires_in * 1000
          : undefined,
      accountId: extractAccountId(tokenPayload.id_token, tokenPayload.access_token)
    }
  }
}

export async function refreshOpenAIAccessToken({
  refreshToken
}: {
  refreshToken: string
}): Promise<OpenAITokenExchangeResult> {
  const response = await fetch(`${OPENAI_OAUTH_ISSUER}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: OPENAI_OAUTH_CLIENT_ID
    }).toString()
  })

  if (!response.ok) {
    throw new Error(`Token refresh failed (${response.status}).`)
  }

  const payload = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    id_token?: string
    expires_in?: number
  }

  if (!payload.access_token) {
    throw new Error("Missing access token in OAuth refresh response.")
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: typeof payload.expires_in === "number" ? Date.now() + payload.expires_in * 1000 : undefined,
    accountId: extractAccountId(payload.id_token, payload.access_token)
  }
}
