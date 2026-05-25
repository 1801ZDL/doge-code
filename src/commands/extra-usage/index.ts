import type { Command } from '../../commands.js'

export const extraUsage: Command = {
  type: 'local',
  name: 'extra-usage',
  description: '',
  supportsNonInteractive: false,
  load: () => Promise.resolve({ call: async () => ({ type: 'text', value: '' }) }),
} as Command

export const extraUsageNonInteractive = extraUsage
