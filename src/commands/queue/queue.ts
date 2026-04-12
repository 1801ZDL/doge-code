import type { LocalCommandCall } from '../../types/command.js'
import {
  addToPersistentQueue,
  clearPersistentQueue,
  getPersistentQueue,
  getPersistentQueueLength,
  removeFromPersistentQueue,
} from '../../utils/persistentQueue.js'

export const call: LocalCommandCall = async (args, _context) => {
  const trimmed = args.trim()

  if (trimmed === 'clear') {
    const count = getPersistentQueueLength()
    clearPersistentQueue()
    return {
      type: 'text',
      value: count > 0
        ? `Queue cleared (${count} task${count === 1 ? '' : 's'} removed).`
        : 'Queue is already empty.',
    }
  }

  // /queue remove <n>
  const removeMatch = trimmed.match(/^remove\s+(\d+)$/i)
  if (removeMatch) {
    const index = parseInt(removeMatch[1]!, 10) - 1 // 1-based for user display
    const removed = removeFromPersistentQueue(index)
    if (removed === undefined) {
      return {
        type: 'text',
        value: `Invalid index. Use /queue remove <1-${getPersistentQueueLength()}> to remove a task.`,
      }
    }
    return {
      type: 'text',
      value: `Removed: "${removed}"`,
    }
  }

  // /queue <task> — add to queue
  if (trimmed.length > 0) {
    addToPersistentQueue(trimmed)
    const position = getPersistentQueueLength()
    return {
      type: 'text',
      value: `Queued (position ${position}): "${trimmed}"`,
    }
  }

  // /queue — show status
  const queue = getPersistentQueue()
  if (queue.length === 0) {
    return {
      type: 'text',
      value: 'Queue is empty. Use /queue <task> to add tasks.',
    }
  }

  const lines = queue.map((task, i) => `  ${i + 1}. ${task}`)
  return {
    type: 'text',
    value: `Queue (${queue.length} task${queue.length === 1 ? '' : 's'}):\n${lines.join('\n')}\n\nUse /queue remove <n> to remove, /queue clear to empty.`,
  }
}
