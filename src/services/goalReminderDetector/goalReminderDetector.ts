/**
 * Goal reminder detector for long-running tasks.
 *
 * Monitors tool call patterns and injects a self-reflection reminder when
 * the agent has been running for an extended period without completing,
 * helping it verify alignment with the original goal and consider alternative approaches.
 */

import type { MessageType } from '../../types/message.js'

const REFLECTION_MESSAGES = [
  // Message 1: Decision to create findings.md
  `You've been working on this task for a while. Consider:

1. **Complexity check:** Is this task complex enough to warrant persistent notes? If yes, create \`findings.md\` (e.g., in the project root or at \`~/.doge/projects/<slug>/findings.md\`).

2. **If findings.md exists:** Read it first. Have you already discovered something relevant? Use it to avoid redundant exploration.

3. **Record new findings:** If you've found anything significant (bug locations, file paths, patterns), write it down now.

4. **Verify goal:** What is the original task? Have you accomplished it?

Creating \`findings.md\` is like creating a CLAUDE.md for this specific question — once started, the model will check it regularly.`,

  // Message 2: Findings maintenance check
  `Before continuing, check your external memory:

1. **Does findings.md exist?** If this task is complex or multi-step, consider creating one at \`~/.doge/projects/<slug>/findings.md\`.

2. **Read existing findings:** If it exists, start by reading it. Key findings prevent rediscovering the wheel.

3. **Update findings:** Have you discovered anything new worth recording?
   - Bug locations or root causes
   - Important file paths or patterns
   - Architecture decisions or tradeoffs
   - Error messages and their meanings

4. **Current stuck point:** What are you trying to solve? Do your findings contain relevant clues?

Once you create \`findings.md\`, treat it as a commitment — check and update it throughout this task.`,

  // Message 3: Documentation and memory reference
  `Consider your exploration strategy:

1. **Project memory:** Check \`~/.doge/projects/<slug>/memory/\` — relevant context may already exist.

2. **Question-level memory:** Is this a complex question that would benefit from a \`findings.md\`? If yes, create one now:
   \`\`\`
   Location: ~/.doge/projects/<slug>/findings.md
   Format: Free-form markdown, timestamped entries
   Content: Key discoveries, file paths, bug locations, patterns
   \`\`\`

3. **Review findings:** If \`findings.md\` exists, read it before continuing.

4. **New findings?** Record anything significant immediately.

Like CLAUDE.md, once \`findings.md\` exists, the model will be reminded to check it regularly.`,

  // Message 4: Goal drift with findings integration
  `You've been working for a while. Quick check:

1. **Original goal:** What specifically were you asked to do?
2. **Current focus:** What are you working on right now?
3. **Findings check:**
   - Does \`~/.doge/projects/<slug>/findings.md\` exist? If not, should you create one?
   - Read existing findings if they exist
   - Add any new discoveries: file locations, bug causes, patterns, decisions

4. **Alignment:** Are these the same thing, or have you drifted?

Key findings to record:
- "Line 42 in src/auth/validate.ts: null pointer when session expires"
- "Config location: ~/.config/doge/mcp.json"
- "API returns 404 when missing trailing slash"

Create findings.md once = benefit forever. Check it every reminder.`,

  // Message 5: Verification with findings
  `Before declaring complete or continuing:

1. **Success criteria:** What does "done" look like?
2. **Findings.md check:**
   - Should you create one? (complex tasks = yes)
   - If exists, read it first
   - Add new discoveries: file paths, root causes, patterns, decisions
3. **Edge cases:** Have you considered boundary conditions?
4. **User requirements:** Did you address everything?

The \`findings.md\` at \`~/.doge/projects/<slug>/findings.md\` is your question-level CLAUDE.md. Create it for complex tasks, maintain it throughout, check it regularly.`,

  // Message 6: Problem-solving checkpoint
  `Mid-exploration checkpoint:

1. **Should you create findings.md?**
   This task warrants persistent notes if:
   - It's a complex bug with multiple files involved
   - You're doing deep investigation with many discoveries
   - There are important file paths or patterns to remember
   - You expect to need this context later

   If yes: \`~/.doge/projects/<slug>/findings.md\`

2. **If findings.md exists:**
   \`cat ~/.doge/projects/<slug>/findings.md\` — review your discoveries first

3. **Record new findings:** Write significant discoveries immediately with timestamps:
   \`\`\`markdown
   ## [timestamp] Description
   - Key finding 1
   - Key finding 2
   \`\`\`

4. **Current stuck point:** Use your findings to solve it.

This is like CLAUDE.md but for this specific question — a shared memory that persists across the session.`,
]

export class GoalReminderDetector {
  private toolCallCount = 0
  private messageCount = 0
  private lastReminderAt = 0
  private lastReminderToolCount = 0
  /** Timestamp when first tool call was made */
  private firstToolCallAt = 0

  /**
   * Record tool calls from assistant messages.
   * Call this after each message from the stream is processed.
   */
  recordToolCalls(messages: MessageType[]): void {
    for (const msg of messages) {
      if (msg.type !== 'assistant') continue
      this.messageCount++

      const content = msg.message?.content
      if (!Array.isArray(content)) continue

      for (const block of content) {
        if (block?.type !== 'tool_use') continue
        this.toolCallCount++

        // Track when first tool call was made
        if (this.firstToolCallAt === 0) {
          this.firstToolCallAt = Date.now()
        }
      }
    }
  }

  /**
   * Returns true when the agent has been running long enough to need a goal reminder.
   */
  shouldRemind(): boolean {
    // Don't remind too early
    if (this.toolCallCount < 10) return false

    // Don't remind more than once every 2 minutes
    if (!this.checkCooldown(120_000)) return false

    // Check if we've been running long enough (at least 2 minutes since first tool call)
    if (this.firstToolCallAt > 0) {
      const elapsed = Date.now() - this.firstToolCallAt
      if (elapsed < 120_000) return false // Less than 2 minutes
    }

    // First reminder triggers after ~20 tool calls
    if (this.lastReminderAt === 0) {
      if (this.toolCallCount < 20) return false
    } else {
      // Subsequent reminders - every 12+ tool calls
      const callsSinceLastReminder = this.toolCallCount - this.lastReminderToolCount
      if (callsSinceLastReminder < 12) return false
    }

    return true
  }

  /** Get the reminder message to inject */
  getReminderMessage(): string {
    const idx = Math.floor(Math.random() * REFLECTION_MESSAGES.length)
    return REFLECTION_MESSAGES[idx]!
  }

  /** Reset after injecting a reminder (to avoid spamming) */
  acknowledgeReminder(): void {
    this.lastReminderAt = Date.now()
    this.lastReminderToolCount = this.toolCallCount
  }

  /** Get total tool calls since start */
  getToolCallCount(): number {
    return this.toolCallCount
  }

  /** Get total messages since start */
  getMessageCount(): number {
    return this.messageCount
  }

  private checkCooldown(ms: number): boolean {
    const now = Date.now()
    if (now - this.lastReminderAt < ms) return false
    return true
  }
}
