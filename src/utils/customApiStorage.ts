import { getSecureStorage } from './secureStorage/index.js'

export type OpenAICompatMode = 'chat_completions' | 'responses'

export type CustomApiProvider = 'anthropic' | 'openai' | 'gemini'

export type CustomApiStorageData = {
  provider?: CustomApiProvider
  openaiCompatMode?: OpenAICompatMode
  baseURL?: string
  apiKey?: string
  model?: string
  savedModels?: string[]
  /**
   * Map of model name to its specific API endpoint configuration.
   * When set, the API call will use this model's specific config instead of the default customApiEndpoint.
   * This enables routing different models to different backends (e.g., local sglang vs cloud API).
   */
  modelEndpointMap?: Record<string, {
    provider?: CustomApiProvider
    baseURL?: string
    apiKey?: string
  }>
}

/**
 * Get the endpoint configuration for a specific model.
 * Returns the model-specific config if exists, otherwise returns undefined.
 */
export function getModelEndpointConfig(modelName: string): { provider?: CustomApiProvider; baseURL?: string; apiKey?: string } | undefined {
  const storage = readCustomApiStorage()
  if (storage.modelEndpointMap && modelName in storage.modelEndpointMap) {
    return storage.modelEndpointMap[modelName]
  }
  return undefined
}

const CUSTOM_API_STORAGE_KEY = 'customApiEndpoint'

export function readCustomApiStorage(): CustomApiStorageData {
  const storage = getSecureStorage() as {
    read?: () => Record<string, unknown> | null
    update?: (data: Record<string, unknown>) => { success: boolean }
  }
  const data = storage.read?.() ?? {}
  const raw = data[CUSTOM_API_STORAGE_KEY]
  if (!raw || typeof raw !== 'object') return {}
  const value = raw as Record<string, unknown>
  const provider =
    value.provider === 'openai' || value.provider === 'anthropic' || value.provider === 'gemini'
      ? value.provider
      : undefined
  const openaiCompatMode =
    value.openaiCompatMode === 'chat_completions' || value.openaiCompatMode === 'responses'
      ? value.openaiCompatMode
      : provider === 'openai'
        ? 'chat_completions'
        : undefined

  // Parse modelEndpointMap
  const modelEndpointMap: CustomApiStorageData['modelEndpointMap'] = {}
  if (value.modelEndpointMap && typeof value.modelEndpointMap === 'object') {
    const map = value.modelEndpointMap as Record<string, unknown>
    for (const [key, config] of Object.entries(map)) {
      if (config && typeof config === 'object') {
        const cfg = config as Record<string, unknown>
        modelEndpointMap[key] = {
          provider: cfg.provider as CustomApiProvider | undefined,
          baseURL: typeof cfg.baseURL === 'string' ? cfg.baseURL : undefined,
          apiKey: typeof cfg.apiKey === 'string' ? cfg.apiKey : undefined,
        }
      }
    }
  }

  return {
    provider,
    openaiCompatMode,
    baseURL: typeof value.baseURL === 'string' ? value.baseURL : undefined,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : undefined,
    model: typeof value.model === 'string' ? value.model : undefined,
    savedModels: Array.isArray(value.savedModels)
      ? value.savedModels.filter((item): item is string => typeof item === 'string')
      : [],
    modelEndpointMap: Object.keys(modelEndpointMap).length > 0 ? modelEndpointMap : undefined,
  }
}

export function writeCustomApiStorage(next: CustomApiStorageData): void {
  const storage = getSecureStorage() as {
    read?: () => Record<string, unknown> | null
    update?: (data: Record<string, unknown>) => { success: boolean }
  }
  const current = storage.read?.() ?? {}
  storage.update?.({
    ...current,
    customApiEndpoint: next,
  })
}

export function clearCustomApiStorage(): void {
  const storage = getSecureStorage() as {
    read?: () => Record<string, unknown> | null
    update?: (data: Record<string, unknown>) => { success: boolean }
  }
  const current = storage.read?.() ?? {}
  const { customApiEndpoint: _, ...rest } = current
  storage.update?.(rest)
}
