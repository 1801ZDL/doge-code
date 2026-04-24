import type { LocalJSXCommandContext } from '../../commands.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import type { PermissionMode } from '../../utils/permissions/PermissionMode.js'
import { permissionModeSymbol } from '../../utils/permissions/PermissionMode.js'
import { savePermissionMode } from '../../utils/sessionStorage.js'
import type { AppState } from '../../state/AppState.js'

function setFocusMode(
  enable: boolean,
  setAppState: (f: (prev: AppState) => AppState) => void,
): void {
  const newMode: PermissionMode = enable ? 'focus' : 'default'
  setAppState(prev => ({
    ...prev,
    toolPermissionContext: {
      ...prev.toolPermissionContext,
      mode: newMode,
    },
  }))
  // Persist to session transcript so --resume can restore it.
  // onChangeAppState also triggers this via dynamic import, but we call
  // directly here to guarantee it fires before any immediate exit.
  savePermissionMode(newMode)
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args?: string,
): Promise<null> {
  const arg = args?.trim().toLowerCase()
  const currentMode = context.getAppState().toolPermissionContext.mode
  const isCurrentlyFocused = currentMode === 'focus'

  if (arg === 'on' || (arg === 'toggle' && !isCurrentlyFocused) || (!arg && !isCurrentlyFocused)) {
    setFocusMode(true, context.setAppState)
    onDone(`${permissionModeSymbol('focus')} Focus mode ON — auto-approving non-dangerous commands`)
  } else if (arg === 'off' || (arg === 'toggle' && isCurrentlyFocused) || (!arg && isCurrentlyFocused)) {
    setFocusMode(false, context.setAppState)
    onDone('Focus mode OFF')
  }
  return null
}
