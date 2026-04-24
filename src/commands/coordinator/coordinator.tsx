import type { LocalJSXCommandContext } from '../../commands.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { saveMode } from '../../utils/sessionStorage.js'

// Check if coordinator mode is currently active via env var directly
// This bypasses the COORDINATOR_MODE feature gate, allowing all users to use
// the /coordinator command
function isCoordinatorMode(): boolean {
  return isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)
}

function setCoordinatorMode(enable: boolean): void {
  if (enable) {
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'
    saveMode('coordinator')
  } else {
    delete process.env.CLAUDE_CODE_COORDINATOR_MODE
    saveMode('normal')
  }
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args?: string,
): Promise<null> {
  const arg = args?.trim().toLowerCase()
  const isCurrentlyCoordinator = isCoordinatorMode()

  if (arg === 'on' || (arg === 'toggle' && !isCurrentlyCoordinator) || (!arg && !isCurrentlyCoordinator)) {
    setCoordinatorMode(true)
    onDone('⚔ Commander mode ON — I will dispatch agents from ~/.doge/agents to execute tasks and verify their results')
  } else if (arg === 'off' || (arg === 'toggle' && isCurrentlyCoordinator) || (!arg && isCurrentlyCoordinator)) {
    setCoordinatorMode(false)
    onDone('Commander mode OFF')
  }
  return null
}
