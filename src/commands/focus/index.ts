import type { Command } from '../../commands.js'
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js'

const focus = {
  type: 'local-jsx',
  name: 'focus',
  aliases: ['focus-mode'],
  description: 'Toggle focus mode — auto-approves non-dangerous commands',
  argumentHint: '[on|off|toggle]',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate()
  },
  load: () => import('./focus.js'),
} satisfies Command

export default focus
