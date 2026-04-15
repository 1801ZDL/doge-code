import type { LocalJSXCommandContext } from '../../commands.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { feature } from 'bun:bundle'
import { saveMode } from '../../utils/sessionStorage.js'
import type { AppState } from '../../state/AppState.js'

// Conditionally import coordinator mode functions
const coordinatorModule = feature('COORDINATOR_MODE')
  ? require('../../coordinator/coordinatorMode.js')
  : null

function isCoordinatorMode(): boolean {
  if (coordinatorModule) {
    return coordinatorModule.isCoordinatorMode()
  }
  return false
}

function setCoordinatorMode(
  enable: boolean,
  setAppState: (f: (prev: AppState) => AppState) => void,
): void {
  if (!feature('COORDINATOR_MODE')) {
    // Coordinator mode feature gate is not enabled
    return
  }

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
  if (!feature('COORDINATOR_MODE')) {
    onDone('Coordinator mode is not available. It requires the COORDINATOR_MODE feature gate to be enabled.')
    return null
  }

  const arg = args?.trim().toLowerCase()
  const isCurrentlyCoordinator = isCoordinatorMode()

  if (arg === 'on' || (arg === 'toggle' && !isCurrentlyCoordinator) || (!arg && !isCurrentlyCoordinator)) {
    setCoordinatorMode(true, context.setAppState)
    onDone('Coordinator mode ON — use /agent to spawn workers')
  } else if (arg === 'off' || (arg === 'toggle' && isCurrentlyCoordinator) || (!arg && isCurrentlyCoordinator)) {
    setCoordinatorMode(false, context.setAppState)
    onDone('Coordinator mode OFF')
  }
  return null
}
