import type { Command } from '../../commands.js'

const cost = {
  type: 'local',
  name: 'cost',
  description: 'Show session cost',
  supportsNonInteractive: true,
  load: () => import('./cost.js'),
} satisfies Command

export default cost
