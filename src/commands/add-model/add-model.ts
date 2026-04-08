import type { LocalCommandCall } from '../../types/command.js'
import { saveGlobalConfig } from '../../utils/config.js'
import { readCustomApiStorage, writeCustomApiStorage, type CustomApiProvider } from '../../utils/customApiStorage.js'

/**
 * Parse flags from command arguments.
 * Supports: --provider <value> --base-url <value> --api-key <value>
 */
function parseArgs(args: string): { modelName: string; provider?: CustomApiProvider; baseURL?: string; apiKey?: string } {
  const parts = args.trim().split(/\s+/)
  const result: { modelName: string; provider?: CustomApiProvider; baseURL?: string; apiKey?: string } = {
    modelName: '',
  }

  let i = 0
  while (i < parts.length) {
    const part = parts[i]
    if (part === '--provider') {
      i++
      if (i < parts.length) {
        const val = parts[i].toLowerCase()
        if (val === 'openai' || val === 'anthropic' || val === 'gemini') {
          result.provider = val as CustomApiProvider
        }
      }
    } else if (part === '--base-url' || part === '--baseurl') {
      i++
      if (i < parts.length) {
        result.baseURL = parts[i]
      }
    } else if (part === '--api-key' || part === '--apikey') {
      i++
      if (i < parts.length) {
        result.apiKey = parts[i]
      }
    } else if (!part.startsWith('--')) {
      result.modelName = part
    }
    i++
  }

  return result
}

export const call: LocalCommandCall = async (args, _context) => {
  const { modelName, provider, baseURL, apiKey } = parseArgs(args)

  if (!modelName) {
    return {
      type: 'text',
      value: `Usage: /add-model <model-name> [--provider <openai|anthropic|gemini>] [--base-url <url>] [--api-key <key>]

Examples:
  /add-model qwen3.5 --provider openai --base-url http://127.0.0.1:8000 --api-key dummy
  /add-model claude-sonnet --provider anthropic
  /add-model gemini-pro --provider gemini --base-url https://generativelanguage.googleapis.com`,
    }
  }

  // Determine if this is adding a model with endpoint configuration
  const hasEndpointConfig = provider !== undefined || baseURL !== undefined || apiKey !== undefined

  if (hasEndpointConfig) {
    // Save endpoint config for this specific model
    const secureStored = readCustomApiStorage()
    const existingMap = secureStored.modelEndpointMap ?? {}

    // Build the endpoint config for this model
    const modelEndpointConfig: { provider?: CustomApiProvider; baseURL?: string; apiKey?: string } = {}
    if (provider) modelEndpointConfig.provider = provider
    if (baseURL) modelEndpointConfig.baseURL = baseURL
    if (apiKey) modelEndpointConfig.apiKey = apiKey

    // Update the model endpoint map
    const newModelEndpointMap = {
      ...existingMap,
      [modelName]: modelEndpointConfig,
    }

    // Also update savedModels list
    const newSavedModels = [...new Set([...(secureStored.savedModels ?? []), modelName])]

    writeCustomApiStorage({
      ...secureStored,
      model: modelName,
      savedModels: newSavedModels,
      modelEndpointMap: newModelEndpointMap,
    })

    // Update global config for current model tracking
    saveGlobalConfig(current => ({
      ...current,
      customApiEndpoint: {
        ...current.customApiEndpoint,
        model: modelName,
        savedModels: newSavedModels,
      },
    }))

    process.env.ANTHROPIC_MODEL = modelName

    const configDesc = []
    if (provider) configDesc.push(`provider=${provider}`)
    if (baseURL) configDesc.push(`baseURL=${baseURL}`)
    if (apiKey) configDesc.push('apiKey=***')

    return {
      type: 'text',
      value: `Added custom model: ${modelName}${configDesc.length > 0 ? ` (${configDesc.join(', ')})` : ''}`,
    }
  }

  // Original behavior: just add model without endpoint config
  saveGlobalConfig(current => ({
    ...current,
    customApiEndpoint: {
      ...current.customApiEndpoint,
      model: modelName,
      savedModels: [...new Set([...(current.customApiEndpoint?.savedModels ?? []), modelName])],
    },
  }))
  const secureStored = readCustomApiStorage()
  writeCustomApiStorage({
    ...secureStored,
    model: modelName,
    savedModels: [...new Set([...(secureStored.savedModels ?? []), modelName])]
  })

  process.env.ANTHROPIC_MODEL = modelName

  return {
    type: 'text',
    value: `Added custom model: ${modelName}`,
  }
}
