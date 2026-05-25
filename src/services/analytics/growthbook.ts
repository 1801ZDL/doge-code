/**
 * GrowthBook stub — all feature gates return defaults.
 * The original implementation connected to Anthropic's GrowthBook/Statsig
 * servers for A/B experiments and dynamic config. This stub preserves the
 * public API so existing call sites compile unchanged.
 */

import { memoize } from 'lodash-es'

export type GrowthBookUserAttributes = {
  id: string
}

export function onGrowthBookRefresh(
  _listener: () => void,
): () => void {
  return () => {}
}

export function hasGrowthBookEnvOverride(_feature: string): boolean {
  return false
}

export function getAllGrowthBookFeatures(): Record<string, unknown> {
  return {}
}

export function getGrowthBookConfigOverrides(): Record<string, unknown> {
  return {}
}

export function setGrowthBookConfigOverride(
  _feature: string,
  _value: unknown,
): void {}

export function clearGrowthBookConfigOverrides(): void {}

export function getApiBaseUrlHost(): string | undefined {
  return undefined
}

export const initializeGrowthBook = memoize(
  async () => {},
  () => 'stub',
)

export async function getFeatureValue_DEPRECATED<T>(
  _feature: string,
  defaultValue: T,
): Promise<T> {
  return defaultValue
}

export function getFeatureValue_CACHED_MAY_BE_STALE<T>(
  _feature: string,
  defaultValue: T,
): T {
  return defaultValue
}

export function getFeatureValue_CACHED_WITH_REFRESH<T>(
  _feature: string,
  defaultValue: T,
): T {
  return defaultValue
}

export function checkStatsigFeatureGate_CACHED_MAY_BE_STALE(
  _gate: string,
  defaultValue = false,
): boolean {
  return defaultValue
}

export async function checkSecurityRestrictionGate(
  _gate: string,
): Promise<boolean> {
  return true
}

export async function checkGate_CACHED_OR_BLOCKING(
  _gate: string,
): Promise<boolean> {
  return false
}

export function refreshGrowthBookAfterAuthChange(): void {}

export function resetGrowthBook(): void {}

export async function refreshGrowthBookFeatures(): Promise<void> {}

export function setupPeriodicGrowthBookRefresh(): void {}

export function stopPeriodicGrowthBookRefresh(): void {}

export async function getDynamicConfig_BLOCKS_ON_INIT<T>(
  _key: string,
  defaultValue: T,
): Promise<T> {
  return defaultValue
}

export function getDynamicConfig_CACHED_MAY_BE_STALE<T>(
  _key: string,
  defaultValue: T,
): T {
  return defaultValue
}
