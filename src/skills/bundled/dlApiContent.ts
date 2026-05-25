// Content for the dl-api bundled skill.
// Each .md file is inlined as a string at build time via Bun's text loader.

import csharpDlApi from './dl-api/csharp/dl-api.md'
import curlExamples from './dl-api/curl/examples.md'
import goDlApi from './dl-api/go/dl-api.md'
import javaDlApi from './dl-api/java/dl-api.md'
import phpDlApi from './dl-api/php/dl-api.md'
import pythonAgentSdkPatterns from './dl-api/python/agent-sdk/patterns.md'
import pythonAgentSdkReadme from './dl-api/python/agent-sdk/README.md'
import pythonDlApiBatches from './dl-api/python/dl-api/batches.md'
import pythonDlApiFilesApi from './dl-api/python/dl-api/files-api.md'
import pythonDlApiReadme from './dl-api/python/dl-api/README.md'
import pythonDlApiStreaming from './dl-api/python/dl-api/streaming.md'
import pythonDlApiToolUse from './dl-api/python/dl-api/tool-use.md'
import rubyDlApi from './dl-api/ruby/dl-api.md'
import skillPrompt from './dl-api/SKILL.md'
import sharedErrorCodes from './dl-api/shared/error-codes.md'
import sharedLiveSources from './dl-api/shared/live-sources.md'
import sharedModels from './dl-api/shared/models.md'
import sharedPromptCaching from './dl-api/shared/prompt-caching.md'
import sharedToolUseConcepts from './dl-api/shared/tool-use-concepts.md'
import typescriptAgentSdkPatterns from './dl-api/typescript/agent-sdk/patterns.md'
import typescriptAgentSdkReadme from './dl-api/typescript/agent-sdk/README.md'
import typescriptDlApiBatches from './dl-api/typescript/dl-api/batches.md'
import typescriptDlApiFilesApi from './dl-api/typescript/dl-api/files-api.md'
import typescriptDlApiReadme from './dl-api/typescript/dl-api/README.md'
import typescriptDlApiStreaming from './dl-api/typescript/dl-api/streaming.md'
import typescriptDlApiToolUse from './dl-api/typescript/dl-api/tool-use.md'

// @[MODEL LAUNCH]: Update the model IDs/names below. These are substituted into {{VAR}}
// placeholders in the .md files at runtime before the skill prompt is sent.
// After updating these constants, manually update the two files that still hardcode models:
//   - dl-api/SKILL.md (Current Models pricing table)
//   - dl-api/shared/models.md (full model catalog with legacy versions and alias mappings)
export const SKILL_MODEL_VARS = {
  OPUS_ID: 'claude-opus-4-6',
  OPUS_NAME: 'Claude Opus',
  SONNET_ID: 'claude-sonnet-4-6',
  SONNET_NAME: 'Claude Sonnet',
  HAIKU_ID: 'claude-haiku-4-5',
  HAIKU_NAME: 'Claude Haiku 4.5',
  // Previous Sonnet ID — used in "do not append date suffixes" example in SKILL.md.
  PREV_SONNET_ID: 'claude-sonnet-4-5',
} satisfies Record<string, string>

export const SKILL_PROMPT: string = skillPrompt

export const SKILL_FILES: Record<string, string> = {
  'csharp/dl-api.md': csharpDlApi,
  'curl/examples.md': curlExamples,
  'go/dl-api.md': goDlApi,
  'java/dl-api.md': javaDlApi,
  'php/dl-api.md': phpDlApi,
  'python/agent-sdk/README.md': pythonAgentSdkReadme,
  'python/agent-sdk/patterns.md': pythonAgentSdkPatterns,
  'python/dl-api/README.md': pythonDlApiReadme,
  'python/dl-api/batches.md': pythonDlApiBatches,
  'python/dl-api/files-api.md': pythonDlApiFilesApi,
  'python/dl-api/streaming.md': pythonDlApiStreaming,
  'python/dl-api/tool-use.md': pythonDlApiToolUse,
  'ruby/dl-api.md': rubyDlApi,
  'shared/error-codes.md': sharedErrorCodes,
  'shared/live-sources.md': sharedLiveSources,
  'shared/models.md': sharedModels,
  'shared/prompt-caching.md': sharedPromptCaching,
  'shared/tool-use-concepts.md': sharedToolUseConcepts,
  'typescript/agent-sdk/README.md': typescriptAgentSdkReadme,
  'typescript/agent-sdk/patterns.md': typescriptAgentSdkPatterns,
  'typescript/dl-api/README.md': typescriptDlApiReadme,
  'typescript/dl-api/batches.md': typescriptDlApiBatches,
  'typescript/dl-api/files-api.md': typescriptDlApiFilesApi,
  'typescript/dl-api/streaming.md': typescriptDlApiStreaming,
  'typescript/dl-api/tool-use.md': typescriptDlApiToolUse,
}
