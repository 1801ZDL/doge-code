import { isAutoMemoryEnabled } from '../../memdir/paths.js'
import { registerBundledSkill } from '../bundledSkills.js'
import { buildConsolidationPrompt } from '../../services/autoDream/consolidationPrompt.js'
import { recordConsolidation } from '../../services/autoDream/consolidationLock.js'
import { getAutoMemPath } from '../../memdir/paths.js'
import { getOriginalCwd } from '../../bootstrap/state.js'
import { getProjectDir } from '../../utils/sessionStorage.js'
import { logForDebugging } from '../../utils/debug.js'

export function registerDreamSkill(): void {
  if (!isAutoMemoryEnabled()) {
    return
  }

  const allowedTools = [
    // Read-only tools only — no Edit, Write, Bash (except read-only commands)
    'Read',
    'Glob',
    'Grep',
  ]

  registerBundledSkill({
    name: 'dream',
    description:
      'Consolidate scattered session history into durable memories. ' +
      'Scans transcript files, updates memory files, and prunes the index. ' +
      'Use this when memory feels stale or sessions have accumulated new signal.',
    whenToUse:
      'Use /dream after a period of active development, when you notice ' +
      'repeating the same context to Claude, or when memories feel outdated.',
    argumentHint: '[optional context — what to focus on]',
    userInvocable: true,
    isEnabled: () => isAutoMemoryEnabled(),
    allowedTools,
    disableModelInvocation: false,
    async getPromptForCommand(args) {
      // Stamp consolidation time optimistically at prompt-build time.
      // This prevents auto-dream from re-firing immediately after manual /dream.
      try {
        await recordConsolidation()
      } catch (e: unknown) {
        logForDebugging(`[/dream] recordConsolidation failed: ${(e as Error).message}`)
      }

      const memoryRoot = getAutoMemPath()
      const transcriptDir = getProjectDir(getOriginalCwd())

      const toolConstraints = `

**Tool constraints for this run:** Bash is restricted to read-only commands (\`ls\`, \`find\`, \`grep\`, \`cat\`, \`stat\`, \`wc\`, \`head\`, \`tail\`, and similar). File edits and writes are ALLOWED — this is a consolidation run and you SHOULD update memory files directly.

Do NOT use any tools other than: Read, Glob, Grep, Bash (read-only commands only), Edit, Write.`

      const extra = args ? `\n\n## User's focus\n\n${args}` : ''
      const prompt = buildConsolidationPrompt(memoryRoot, transcriptDir, toolConstraints + extra)

      return [{ type: 'text', text: prompt }]
    },
  })
}
