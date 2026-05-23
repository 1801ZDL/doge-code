import { AGENT_TOOL_NAME } from '../../tools/AgentTool/constants.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../../tools/AskUserQuestionTool/prompt.js'
import { SKILL_TOOL_NAME } from '../../tools/SkillTool/constants.js'
import { getIsGit } from '../../utils/git.js'
import { registerBundledSkill } from '../bundledSkills.js'

const MIN_APPROACHES = 2
const MAX_APPROACHES = 5

const WORKER_INSTRUCTIONS = `Before starting work:
1. **Verify isolation** — Confirm you are in an isolated git worktree (check that the current directory is NOT the main repo root; the path should contain ".claude/worktrees/"). If you are NOT in a worktree, STOP and report the issue immediately.
2. **Initialize submodules** — If target files are inside a submodule directory that is empty or missing, run "git submodule update --init" (or "git submodule update --init --recursive" if nested submodules exist). Do NOT proceed if submodule initialization fails.
3. **Verify target files exist** — Before editing any file, confirm it exists in the current worktree. If it does not exist, STOP and report — do not silently create files in unexpected locations or modify files outside the worktree.

After you finish implementing your assigned approach:
4. **Run tests** — Run the project's test suite. If tests fail, fix them or note why they can't be fixed.
5. **Self-review** — Invoke the \`${SKILL_TOOL_NAME}\` tool with \`skill: "simplify"\` to review and clean up your changes.
6. **Report** — End your response with a structured summary in this exact format:

---
**Approach:** <one-line description of what you did>
**Files changed:** <comma-separated list of modified files>
**Test results:** <pass/fail/partial — include command and output summary>
**Tradeoffs:** <what this approach does well and what it sacrifices>
**Confidence:** <high/medium/low — how confident you are this is the best way>
---

Keep your implementation focused. Do not refactor unrelated code.`

function buildPrompt(problem: string): string {
  return `# Compete: Parallel Approach Comparison

You are orchestrating a competition between multiple implementation approaches to the SAME problem. Each approach will be implemented in isolation by a separate agent in its own git worktree. Afterwards, you will compare the results and recommend the best approach.

## Problem

${problem}

## Phase 1: Design Approaches

First, design ${MIN_APPROACHES}–${MAX_APPROACHES} distinct, non-trivial approaches to solve this problem. Each approach must:
- Be a genuinely different strategy (not just cosmetic variations)
- Be independently implementable without knowing the other approaches
- Be roughly comparable in scope (don't pair a 10-line hack with a full rewrite)

If the problem is simple and only 2 meaningful approaches exist, use 2. If it's complex and many strategies are viable, use up to ${MAX_APPROACHES}.

For each approach, write:
- **Title**: Short name (e.g., "Event-driven refactor", "Add caching layer")
- **Strategy**: 2-3 sentences describing the core idea
- **Rationale**: Why this approach might win
- **Risk**: What could go wrong

Present the approaches to the user. If they want to add, remove, or edit approaches, use the \`${ASK_USER_QUESTION_TOOL_NAME}\` tool to iterate. Once the user confirms, proceed to Phase 2.

## Phase 2: Spawn Competitors

Spawn one background agent per approach using the \`${AGENT_TOOL_NAME}\` tool. **All agents must use \`isolation: "worktree"\` and \`run_in_background: true\`.** Launch them all in a single message block so they run in parallel.

For each agent, the prompt must be fully self-contained and include:
- The original problem (verbatim from above)
- The specific approach assigned to this agent (title + strategy + rationale)
- Any codebase conventions you discovered that the worker needs to follow
- The worker instructions below, copied verbatim:

\`\`\`
${WORKER_INSTRUCTIONS}
\`\`\`

Use \`subagent_type: "general-purpose"\`.

## Phase 3: Track Progress

After launching all agents, render an initial status table:

| # | Approach | Status | Worktree |
|---|----------|--------|----------|
| 1 | <title> | running | — |
| 2 | <title> | running | — |

As background-agent completion notifications arrive, parse the structured summary from each agent's result and re-render the table with updated status (\`done\` / \`failed\`) and worktree paths.

## Phase 4: Compare and Recommend

When all agents have reported, render a final comparison table:

| Approach | Test Results | Tradeoffs | Confidence | Worktree |
|----------|-------------|-----------|------------|----------|
| <title> | <pass/fail> | <summary> | <high/med/low> | <path> |

Then give your recommendation:
1. **Winner**: Which approach is best and why
2. **Runner-up**: Which is second-best and under what conditions it might be preferable
3. **Next step**: Whether to merge the winning approach, ask the user to review the worktrees manually, or run a follow-up competition with refined approaches
`
}

const NOT_A_GIT_REPO_MESSAGE = `This is not a git repository. The \`/compete\` command requires a git repo because it spawns agents in isolated git worktrees. Initialize a repo first, or run this from inside an existing one.`

const MISSING_PROBLEM_MESSAGE = `Describe the problem or feature you want to compare approaches for.

Examples:
  /compete optimize the image resizing pipeline
  /compete add retry logic to the API client
  /compete refactor the auth middleware to support SSO`

export function registerCompeteSkill(): void {
  registerBundledSkill({
    name: 'compete',
    description:
      'Compare multiple implementation approaches to the same problem by running them in parallel across isolated worktree agents.',
    whenToUse:
      'Use when you are unsure which approach is best for a problem and want to see 2–5 competing implementations evaluated side-by-side.',
    argumentHint: '<problem description>',
    userInvocable: true,
    disableModelInvocation: true,
    async getPromptForCommand(args) {
      const problem = args.trim()
      if (!problem) {
        return [{ type: 'text', text: MISSING_PROBLEM_MESSAGE }]
      }

      const isGit = await getIsGit()
      if (!isGit) {
        return [{ type: 'text', text: NOT_A_GIT_REPO_MESSAGE }]
      }

      return [{ type: 'text', text: buildPrompt(problem) }]
    },
  })
}
