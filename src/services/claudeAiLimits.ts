export type ClaudeAILimits = {
  status?: string
  isUsingOverage: boolean
  overageDisabledReason: string | null
  overageStatus: string | null
  unifiedRateLimitFallbackAvailable?: boolean
}

export type OverageDisabledReason = string

export const currentLimits: ClaudeAILimits = {
  isUsingOverage: false,
  overageDisabledReason: null,
  overageStatus: null,
}

export const statusListeners: Set<(limits: ClaudeAILimits) => void> = new Set()

export async function checkQuotaStatus(): Promise<void> {}

export function extractQuotaStatusFromError(_error: unknown): void {}

export function extractQuotaStatusFromHeaders(_headers: unknown): void {}

export function getRateLimitWarning(_limits: ClaudeAILimits, _model: string): string | null {
  return null
}

export function getUsingOverageText(_limits?: ClaudeAILimits): string | null {
  return null
}

export function getRawUtilization(): unknown {
  return null
}
