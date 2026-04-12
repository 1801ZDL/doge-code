import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { createSignal } from './signal.js'

const HOME_DIR = process.env.HOME ?? homedir()
const DOGE_DIR = join(HOME_DIR, '.doge')
const QUEUE_FILE = join(DOGE_DIR, 'queue.json')

interface QueueData {
  tasks: string[]
  createdAt: string
}

const queueChanged = createSignal()

/** Subscribe to queue changes. */
export const subscribeToPersistentQueue = queueChanged.subscribe

function loadQueue(): string[] {
  try {
    if (!existsSync(QUEUE_FILE)) {
      return []
    }
    const data = readFileSync(QUEUE_FILE, 'utf-8')
    const parsed: QueueData = JSON.parse(data)
    return Array.isArray(parsed.tasks) ? parsed.tasks : []
  } catch {
    return []
  }
}

function saveQueue(tasks: string[]): void {
  try {
    if (!existsSync(DOGE_DIR)) {
      mkdirSync(DOGE_DIR, { recursive: true })
    }
    const data: QueueData = {
      tasks,
      createdAt: new Date().toISOString(),
    }
    writeFileSync(QUEUE_FILE, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    console.error('Failed to save persistent queue:', err)
  }
}

let _tasks: string[] | null = null

function getTasks(): string[] {
  if (_tasks === null) {
    _tasks = loadQueue()
  }
  return _tasks
}

function notify(): void {
  queueChanged.emit()
}

/** Add a task to the persistent queue. */
export function addToPersistentQueue(task: string): void {
  const tasks = getTasks()
  tasks.push(task)
  _tasks = tasks
  saveQueue(tasks)
  notify()
}

/** Remove a task by index. Returns the removed task or undefined. */
export function removeFromPersistentQueue(index: number): string | undefined {
  const tasks = getTasks()
  if (index < 0 || index >= tasks.length) {
    return undefined
  }
  const [removed] = tasks.splice(index, 1)
  _tasks = tasks
  saveQueue(tasks)
  notify()
  return removed
}

/** Clear all tasks from the persistent queue. */
export function clearPersistentQueue(): void {
  _tasks = []
  saveQueue([])
  notify()
}

/** Get a snapshot of the current queue. */
export function getPersistentQueue(): string[] {
  return [...getTasks()]
}

/**
 * Pop the first task from the persistent queue.
 * Returns the task and removes it from storage.
 */
export function popPersistentQueue(): string | undefined {
  const tasks = getTasks()
  if (tasks.length === 0) {
    return undefined
  }
  const [task] = tasks.splice(0, 1)
  _tasks = tasks
  saveQueue(tasks)
  notify()
  return task
}

/** Check if persistent queue has tasks. */
export function hasPersistentQueueTasks(): boolean {
  return getTasks().length > 0
}

/** Get queue length. */
export function getPersistentQueueLength(): number {
  return getTasks().length
}
