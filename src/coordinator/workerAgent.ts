import type { ToolUseContext } from '../Tool.js'
import type { BuiltInAgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import { ASYNC_AGENT_ALLOWED_TOOLS } from '../constants/tools.js'

export const WORKER_AGENT = 'worker'

// Workers get the same tools as async agents (minus internal coordinator tools which are
// filtered at spawn time via INTERNAL_WORKER_TOOLS in coordinatorMode.ts).
const WORKER_TOOLS = Array.from(ASYNC_AGENT_ALLOWED_TOOLS).sort()

// Note: params.toolUseContext is accepted for BuiltInAgentDefinition signature
// compatibility but not used — workers get their task context from the coordinator's prompt.
function getWorkerSystemPrompt(
  _params: { toolUseContext: Pick<ToolUseContext, 'options'> },
): string {
  return `You are a worker agent, spawned by a coordinator to complete a specific task.

Your role:
- Execute the task assigned by the coordinator completely
- Use your available tools to research, implement, and verify
- Report findings concisely when done — the coordinator will relay to the user

Guidelines:
- Be thorough but focused — complete the specific task, don't go beyond it
- When you complete a task, provide a clear summary of what was done
- If you encounter blockers, report them and suggest alternatives
- Read project memory files (\`~/.doge/projects/<slug>/memory/\`) if context feels incomplete`
}

export function getCoordinatorAgents(): BuiltInAgentDefinition[] {
  return [
    {
      agentType: WORKER_AGENT,
      whenToUse:
        'Worker agents execute specific tasks delegated by the coordinator. Workers have access to a curated set of tools (Bash, Read, Edit, Search, Web, Skills). Use for research, implementation, or verification tasks.',
      tools: WORKER_TOOLS,
      source: 'built-in',
      baseDir: 'built-in',
      getSystemPrompt,
    },
  ]
}
