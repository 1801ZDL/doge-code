/**
 * Stuck detection for async agents.
 *
 * Monitors tool call patterns and injects a self-reflection prompt when
 * the agent appears to be looping on the same action without making progress.
 */

import type { MessageType } from '../../types/message.js'

interface ToolCall {
  name: string
  /** JSON-stringified input for exact match */
  input: string
  /** Normalized input for similarity detection */
  normalizedInput: string
}

/** Tools that most often indicate spinning in circles when repeated */
const HIGHLY_SUSPICIOUS_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'Bash',
  'WebSearch',
  'WebFetch',
])

/** Number of recent tool calls to track */
const WINDOW_SIZE = 12

/** Consecutive identical tool+input calls before triggering reflection */
const CONSECUTIVE_THRESHOLD = 3

/** Total repetitions of the same tool+input in the window */
const REPETITION_THRESHOLD = 4

/** Minimum unique tools before considering the agent "exploring" (not stuck) */
const EXPLORATION_THRESHOLD = 4

const REFLECTION_MESSAGES = [
  `You seem to be repeating the same action multiple times without making progress. Before continuing, stop and reflect:

1. What specific blocker or problem are you trying to solve?
2. Have you already thoroughly read/analyzed the relevant files or outputs?
3. Is there a completely different approach you haven't tried yet?
4. Would asking the user for clarification or direction be more effective than continuing in circles?

Take a different approach and be more efficient.`,

  `You've been calling the same tool repeatedly with similar inputs. This often indicates you're stuck in a loop. Consider:

1. Do you actually need more of the same information, or do you already have enough?
2. Try a different strategy — perhaps write or edit a file directly, or use a completely different tool.
3. If you're unsure what to do next, provide the user with a clear status update and ask for guidance.
4. Don't keep trying the same thing hoping for a different result.

Reflect on your approach and try something new.`,

  `I notice you've been repeating the same tool calls. Before continuing with more of the same, consider:

- Do you already have enough information to make a decision or take action?
- Is there a simpler or more direct way to accomplish the goal?
- Would it help to step back and explain to the user what you've found and what you're planning to do next?

Avoid running in circles. Either take a concrete step forward or communicate your status clearly.`,
]

export class StuckDetector {
  private window: ToolCall[] = []
  private lastReflectAt = 0
  /** How many tool calls since the last reflection */
  private callsSinceReflection = 0

  /**
   * Record a tool call from an assistant message's tool_use content blocks.
   * Call this after each message from the stream is processed.
   */
  recordToolCalls(messages: MessageType[]): void {
    for (const msg of messages) {
      if (msg.type !== 'assistant') continue
      const content = msg.message?.content
      if (!Array.isArray(content)) continue
      for (const block of content) {
        if (block?.type !== 'tool_use') continue
        const name = typeof block.name === 'string' ? block.name : String(block.name ?? '')
        const input = typeof block.input === 'object'
          ? JSON.stringify(block.input)
          : String(block.input ?? '{}')
        const normalized = this.normalizeInput(name, input)
        this.window.push({ name, input, normalizedInput: normalized })
        if (this.window.length > WINDOW_SIZE) {
          this.window.shift()
        }
      }
    }
    this.callsSinceReflection += messages.filter(m => {
      if (m.type !== 'assistant') return false
      const c = m.message?.content
      return Array.isArray(c) && c.some((b: unknown) => b && typeof b === 'object' && (b as Record<string, unknown>).type === 'tool_use')
    }).length
  }

  /**
   * Returns true when the agent appears stuck and should receive a reflection prompt.
   */
  shouldReflect(): boolean {
    if (this.window.length < 3) return false

    // Check: have enough calls happened since last reflection?
    if (this.callsSinceReflection < 4) return false

    // Check: consecutive identical calls
    const lastN = this.window.slice(-CONSECUTIVE_THRESHOLD * 2)
    let consecutiveSame = 1
    for (let i = lastN.length - 1; i > 0; i--) {
      if (lastN[i]?.input === lastN[i - 1]?.input &&
          lastN[i]?.name === lastN[i - 1]?.name) {
        consecutiveSame++
        if (consecutiveSame >= CONSECUTIVE_THRESHOLD) {
          return this.checkCooldown()
        }
      } else {
        consecutiveSame = 1
      }
    }

    // Check: too many repetitions of the same tool+input in the window
    const counts = new Map<string, number>()
    for (const call of this.window) {
      const key = `${call.name}:${call.input}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    for (const [, count] of counts) {
      if (count >= REPETITION_THRESHOLD) {
        return this.checkCooldown()
      }
    }

    // Check: highly suspicious — calling the same tool repeatedly with similar inputs
    // (more lenient than exact repetition)
    const toolCounts = new Map<string, number>()
    for (const call of this.window) {
      if (HIGHLY_SUSPICIOUS_TOOLS.has(call.name)) {
        toolCounts.set(call.name, (toolCounts.get(call.name) ?? 0) + 1)
      }
    }
    for (const [tool, count] of toolCounts) {
      if (count >= CONSECUTIVE_THRESHOLD) {
        // Also check that we're not just "exploring" — unique tools should be diverse
        const uniqueTools = new Set(this.window.map(c => c.name))
        if (uniqueTools.size < EXPLORATION_THRESHOLD) {
          return this.checkCooldown()
        }
      }
    }

    return false
  }

  /** Get the reflection message to inject */
  getReflectionMessage(): string {
    const idx = Math.floor(Math.random() * REFLECTION_MESSAGES.length)
    return REFLECTION_MESSAGES[idx]!
  }

  /** Reset after injecting a reflection (to avoid spamming) */
  acknowledgeReflection(): void {
    this.lastReflectAt = Date.now()
    this.callsSinceReflection = 0
    // Keep the window so we don't immediately re-trigger on the next few calls
    // but trim oldest calls to prevent immediate re-trigger
    this.window = this.window.slice(-4)
  }

  private checkCooldown(): boolean {
    const now = Date.now()
    // Don't reflect more than once every 60 seconds
    if (now - this.lastReflectAt < 60_000) return false
    return true
  }

  private normalizeInput(toolName: string, input: string): string {
    try {
      const parsed = JSON.parse(input)
      // Strip noise fields that differ on every call
      const cleaned: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(parsed)) {
        if (k === 'file_path' || k === 'path' || k === 'file' || k === 'dir') {
          // Normalize file paths to just the base name to detect same-file repetition
          cleaned[k] = typeof v === 'string' ? v.split('/').pop() ?? v : v
        } else if (k === 'command' && typeof v === 'string') {
          // Normalize bash commands — strip trailing whitespace and normalize spaces
          cleaned[k] = v.trim().replace(/\s+/g, ' ')
        } else if (Array.isArray(v)) {
          cleaned[k] = v
        } else if (typeof v === 'string' && v.length > 200) {
          // Truncate very long string values for comparison
          cleaned[k] = v.substring(0, 200)
        } else {
          cleaned[k] = v
        }
      }
      return `${toolName}:${JSON.stringify(cleaned)}`
    } catch {
      return `${toolName}:${input}`
    }
  }
}
