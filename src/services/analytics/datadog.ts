import { memoize } from 'lodash-es'

export const initializeDatadog = memoize(async (): Promise<boolean> => {
  return false
})

export async function shutdownDatadog(): Promise<void> {}

export async function trackDatadogEvent(
  _name: string,
  _metadata: Record<string, unknown>,
): Promise<void> {}
