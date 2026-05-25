// OAuth client stub — all Anthropic OAuth endpoints have been disconnected.
// dl-code uses custom API keys configured via /login instead.

import type { OAuthTokens, SubscriptionType } from './types.js'

export function shouldUseClaudeAIAuth(_scopes: string[] | undefined): boolean {
  return false
}

export function parseScopes(scopeString?: string): string[] {
  return scopeString ? scopeString.split(' ') : []
}

export function buildAuthUrl(_params: unknown): string {
  throw new Error('OAuth login is not supported. Use /login to configure your API endpoint.')
}

export async function exchangeCodeForTokens(_code: string): Promise<OAuthTokens> {
  throw new Error('OAuth token exchange is not supported.')
}

export async function refreshOAuthToken(_refreshToken: string): Promise<OAuthTokens> {
  throw new Error('OAuth token refresh is not supported.')
}

export async function fetchAndStoreUserRoles(): Promise<void> {}

export async function createAndStoreApiKey(): Promise<string | null> {
  return null
}

export function isOAuthTokenExpired(_expiresAt: number | null): boolean {
  return false
}

export async function fetchProfileInfo(_accessToken: string): Promise<null> {
  return null
}

export async function getOrganizationUUID(): Promise<string | null> {
  return null
}

export async function populateOAuthAccountInfoIfNeeded(): Promise<boolean> {
  return false
}

export function storeOAuthAccountInfo(_info: unknown): void {}
