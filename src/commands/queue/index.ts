import type { Command } from '../../commands.js'

const queue = {
  type: 'local',
  name: 'queue',
  aliases: ['q'],
  description: 'Queue tasks for sequential execution while you sleep',
  argumentHint: '[<task>|clear|remove <n>]',
  supportsNonInteractive: true,
  load: () => import('./queue.js'),
} satisfies Command

export default queue
