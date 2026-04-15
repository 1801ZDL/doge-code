import type { Command } from '../../commands.js'
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js'

const coordinator = {
  type: 'local-jsx',
  name: 'coordinator',
  aliases: ['coord'],
  description: 'Toggle coordinator mode — orchestrate multiple worker agents',
  argumentHint: '[on|off|toggle]',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate()
  },
  load: () => import('./coordinator.js'),
} satisfies Command

export default coordinator
