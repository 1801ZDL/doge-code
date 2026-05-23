# Coordinator Mode Investigation Findings

## Original Task
Investigate the coordinator mode implementation in `/home/wodelt/code/doge-code`. Find all places where:
1. Debug/logging messages are printed during coordinator mode operation
2. Agent status messages are formatted (like "第X个 agent 已完成" or "继续等待第X个 agent")
3. Teammate messages are displayed/formatted
4. Any Chinese/English mixed output strings

## Key Finding: NO Chinese Strings Found
After exhaustive search across the entire codebase, **no Chinese strings matching the patterns described by the user were found**. Specifically:
- No occurrences of "第X个 agent 已完成"
- No occurrences of "继续等待第X个 agent"
- No Chinese/English mixed output strings in coordinator-related code

The codebase appears to be entirely English-based for all user-facing and debug messages.

---

## 1. Debug/Logging Messages During Coordinator Mode Operation

### Analytics Events (logEvent)
| File | Line | Event Name |
|------|------|------------|
| `src/coordinator/coordinatorMode.ts` | 72 | `tengu_coordinator_mode_switched` |
| `src/utils/swarm/inProcessRunner.ts` | 973 | `tengu_agent_memory_loaded` |
| `src/tools/AgentTool/agentToolUtils.ts` | 316 | `tengu_agent_tool_completed` |
| `src/tools/AgentTool/agentToolUtils.ts` | 334 | `tengu_cache_eviction_hint` |
| `src/tools/AgentTool/agentToolUtils.ts` | 425 | `tengu_auto_mode_decision` |
| `src/tools/AgentTool/agentToolUtils.ts` | 627, 693 | `tengu_agent_tool_terminated` |
| `src/tools/AgentTool/AgentTool.tsx` | 421 | `tengu_agent_tool_selected` |
| `src/tools/AgentTool/AgentTool.tsx` | 468 | `tengu_agent_tool_remote_launched` |
| `src/tools/AgentTool/AgentTool.tsx` | 526 | `tengu_agent_memory_loaded` |
| `src/tools/AgentTool/AgentTool.tsx` | 1031, 1166, 1243 | `tengu_agent_tool_terminated` |
| `src/tools/AgentTool/loadAgentsDir.ts` | 332 | `tengu_agent_parse_error` |

### Debug Logs (logForDebugging)
| File | Line | Message Pattern |
|------|------|-----------------|
| `src/utils/swarm/inProcessRunner.ts` | 172 | `[createInProcessCanUseTool] Coordinator mode: auto-allowing ${tool.name}` |
| `src/utils/swarm/inProcessRunner.ts` | 663-678 | Task claiming errors |
| `src/utils/swarm/inProcessRunner.ts` | 723 | Runner lifecycle |
| `src/utils/swarm/inProcessRunner.ts` | 755-780 | Message waiting/polling |
| `src/utils/swarm/inProcessRunner.ts` | 815-871 | Tool use/result logging |
| `src/utils/swarm/inProcessRunner.ts` | 888 | Prompt formatting |
| `src/utils/swarm/inProcessRunner.ts` | 928 | Idle notification |
| `src/utils/swarm/inProcessRunner.ts` | 1073-1102 | Memory loading |
| `src/utils/swarm/inProcessRunner.ts` | 1202 | Agent run start |
| `src/utils/swarm/inProcessRunner.ts` | 1239-1262 | Tool use blocks |
| `src/utils/swarm/inProcessRunner.ts` | 1331 | Loop end |
| `src/utils/swarm/inProcessRunner.ts` | 1343-1408 | Idle/shutdown handling |
| `src/utils/swarm/inProcessRunner.ts` | 1429-1472 | Shutdown/new message |
| `src/utils/swarm/inProcessRunner.ts` | 1530 | Task completion |
| `src/utils/swarm/inProcessRunner.ts` | 1611-1612 | Unhandled errors |

---

## 2. /debug Command Integration

**File:** `src/skills/bundled/debug.ts` (lines 1-103)

- `/debug` enables `runtimeDebugEnabled = true` which causes `isDebugMode()` to return true
- This affects `logForDebugging()` calls throughout the codebase
- **Coordinator mode debug logs ARE partially integrated**:
  - ✅ `logForDebugging()` calls in `inProcessRunner.ts` (~30 calls) ARE visible when `/debug` is on
  - ❌ `appendDebugLog()` calls (~10 calls) are NOT visible - they write to `/tmp/doge-worker-debug.log` unconditionally

### Environment Variables Controlling Debug Output
| Variable | Effect | Lines in `src/utils/debug.ts` |
|----------|--------|-------------------------------|
| `CLAUDE_CODE_DEBUG_LOG_LEVEL` | Sets minimum log level | 34-40 |
| `DEBUG` | Enables debug mode | 47 |
| `DEBUG_SDK` | Enables debug mode | 48 |
| `--debug` / `-d` | Enables debug mode | 49-50 |
| `--debug-to-stderr` / `-d2e` | Enables debug mode + writes to stderr | 85-88 |
| `CLAUDE_CODE_DEBUG_LOGS_DIR` | Overrides debug log directory | 233 |

---

## 3. Debug Log Formatting Issues and Fixes

### Issues Found:
1. **Two parallel debug logging systems**: `logForDebugging()` (global, controlled by `/debug`) and `appendDebugLog()` (local, writes to `/tmp/doge-worker-debug.log` unconditionally)
2. **Inconsistent prefix styles**: `[createInProcessCanUseTool]`, `[inProcessRunner]`, `[print.ts]`
3. **Inconsistent message formats**: some with leading spaces, some all-caps, some lowercase
4. **Same event logged twice** to both systems (line 1201-1202 in inProcessRunner.ts)

### Fixes Applied:
- **Replaced `appendDebugLog()` with `logForDebugging()`** in `src/utils/swarm/inProcessRunner.ts`
- Removed the `appendDebugLog()` function definition (lines 119-126)
- Removed `appendFileSync` and `dirname` imports from `fs`/`path`
- All coordinator debug logs are now controlled by `/debug` command

---

## 4. UI Flickering When Switching Workers — Fixed

### Root Cause
**React tearing** caused by mixing imperative `store.getState()` with reactive `useSyncExternalStore` (via `useAppState`):

1. **`PromptInput.tsx` line 327**: `const viewedTeammate = getViewedTeammateTask(store.getState())` — reads live store state
   - **Fix**: Changed to `useAppState(s => getViewedTeammateTask(s))` — reads consistent snapshot

2. **`useSwarmBanner.ts` line 58**: `const state = store.getState()` — reads live store state
   - **Fix**: Replaced all `state` references with individual `useAppState()` selectors
   - Removed `useAppStateStore` import

### Files Modified:
| File | Lines | Change |
|------|-------|--------|
| `src/components/PromptInput/PromptInput.tsx` | 327 | `store.getState()` → `useAppState()` |
| `src/components/PromptInput/useSwarmBanner.ts` | 44-145 | All `store.getState()` → `useAppState()` |

---

## 5. Worker Display Name Support — Added

### Problem
Worker names default to `worker-${Date.now()}` (e.g., `worker-1779347253241`), making it hard to identify workers by their role.

### Solution
Added optional `displayName` field that is shown in UI but does NOT affect routing/communication:

### Types Modified:
| File | Type | Added Field |
|------|------|-------------|
| `src/tasks/InProcessTeammateTask/types.ts` | `TeammateIdentity` | `displayName?: string` |
| `src/utils/teammateContext.ts` | `TeammateContext` | `displayName?: string` |
| `src/utils/swarm/spawnInProcess.ts` | `InProcessSpawnConfig` | `displayName?: string` |

### Helper Function:
- **`getTeammateDisplayName(identity)`** in `src/tasks/InProcessTeammateTask/types.ts` — returns `displayName || agentName`

### Spawn Flow Updated:
- `src/utils/swarm/spawnInProcess.ts` (lines 108-147) — `displayName` is passed through identity and context

### UI Components Updated to Use displayName:
| File | Component |
|------|-----------|
| `src/components/messages/UserTeammateMessage.tsx` | Teammate message display |
| `src/components/PromptInput/PromptInput.tsx` | Viewing agent name in footer |
| `src/components/PromptInput/useSwarmBanner.ts` | Banner text |
| `src/components/TeammateViewHeader.tsx` | View header |
| `src/components/Spinner/TeammateSpinnerLine.tsx` | Spinner line |
| `src/components/Spinner/SpinnerAnimationRow.tsx` | Animation status |
| `src/components/tasks/InProcessTeammateDetailDialog.tsx` | Detail dialog |
| `src/components/tasks/BackgroundTasksDialog.tsx` | Task list dialog |

### How It Works
- `agentName` is used for mailbox routing and identity (unchanged)
- `displayName` is purely for UI display (optional, falls back to `agentName`)
- The team-lead can set `displayName` when spawning a worker without breaking communication

---

## 6. Team-Lead and Worker Communication

### Mechanism
- **Primary**: File-based mailbox at `~/.dl/teams/{team_name}/inboxes/{agent_name}.json`
- **SendMessage tool**: Writes to mailbox, uses `agentName` (not `agentId`) for routing
- **Mailbox functions**: `readMailbox()`, `writeToMailbox()` in `src/utils/teammateMailbox.ts`

### Key Points
- `agentId` format: `agentName@teamName` (e.g., `researcher@my-team`)
- `agentName` is used for mailbox filenames (not full `agentId`)
- `displayName` is NOT used for routing — purely UI

### Idle Notifications
- Worker sends idle notification via `sendIdleNotification()` in `src/utils/swarm/inProcessRunner.ts`
- Leader waits via `waitForTeammatesToBecomeIdle()` in `src/utils/teammate.ts`

---

## 7. Agent Status Message Formatting

### Agent Tool Result Messages (AgentTool.tsx)
| Status | File | Lines | Formatted Text |
|--------|------|-------|----------------|
| `teammate_spawned` | `src/tools/AgentTool/AgentTool.tsx` | 1342-1347 | `Spawned successfully.\nagent_id: ...\nname: ...\nteam_name: ...` |
| `remote_launched` | `src/tools/AgentTool/AgentTool.tsx` | 1357 | `Remote agent launched in CCR...` |
| `async_launched` | `src/tools/AgentTool/AgentTool.tsx` | 1362-1363 | `Async agent launched successfully...` |
| `completed` (no output) | `src/tools/AgentTool/AgentTool.tsx` | 1383 | `(Subagent completed but returned no output.)` |
| `completed` (with output) | `src/tools/AgentTool/AgentTool.tsx` | 1402-1405 | `agentId: ... <usage>total_tokens: ...</usage>` |

### Coordinator Mode Switch Messages
| File | Lines | Message |
|------|-------|---------|
| `src/coordinator/coordinatorMode.ts` | 76-78 | `'Entered coordinator mode...'` / `'Exited coordinator mode...'` |
| `src/commands/coordinator/coordinator.tsx` | 33 | `'Commander mode ON...'` |
| `src/commands/coordinator/coordinator.tsx` | 36 | `'Commander mode OFF'` |

---

## 8. Teammate Messages Display/Formatting

### XML Teammate Message Format
- `src/constants/xml.ts` line 52: `TEAMMATE_MESSAGE_TAG = 'teammate-message'`
- Format: `<teammate-message teammate_id="${from}" color="..." summary="...">\n${content}\n</teammate-message>`

### Rendering Components
| File | Lines | Description |
|------|-------|-------------|
| `src/components/messages/UserTeammateMessage.tsx` | 25-141 | Main teammate message renderer |
| `src/components/TeammateViewHeader.tsx` | 15-79 | "Viewing @name · esc to return" |
| `src/components/CoordinatorAgentStatus.tsx` | 15-200 | Task panel UI |

---

## 12. Root Cause: Custom Agents Not Found — ripgrep Binary Lacks Execute Permission

### Problem
1. **Restart dl-code → `/agents` shows "No agents found"** despite 7 agent files in `~/.dl/agents/`
2. **Coordinator mode calls `spec-coder` → error**: "Agent type 'spec-coder' not found. Available agents: worker, reader"

### Root Cause
**`src/utils/vendor/ripgrep/x64-linux/rg` has NO execute permission** (`-rw-r--r--`).

`loadMarkdownFiles()` in `src/utils/markdownConfigLoader.ts:560-584` uses ripgrep to find `.md` files. When ripgrep fails with `EACCES` (Permission denied):
- `isFsInaccessible()` returns `true` (line 582)
- The function returns `[]` (empty array) instead of falling back to native search
- Result: `~/.dl/agents/*.md` files are never discovered

### Why Fallback Didn't Work
The catch block only falls back to `findMarkdownFilesNative` for `ENOENT` (missing binary):
```typescript
if (!useNative && code === 'ENOENT') {
  files = await findMarkdownFilesNative(dir, signal)  // ENOENT → fallback ✅
} else {
  if (isFsInaccessible(e)) return []  // EACCES → returns empty ❌
  throw e
}
```

### Fix (Two Layers)
1. **Immediate**: Add execute permission to ripgrep binary
   ```bash
   chmod +x src/utils/vendor/ripgrep/x64-linux/rg
   ```
2. **Code**: Changed fallback logic in `src/utils/markdownConfigLoader.ts:567-581`
   - Before: only `ENOENT` → native fallback; `EACCES` → silently return `[]`
   - After: any `isFsInaccessible` error (`ENOENT`, `EACCES`, `EPERM`, etc.) → native fallback
   - This prevents silent agent/command/skill disappearance when ripgrep has permission issues

---

## Summary of Files Involved

### Core Coordinator Files
- `src/coordinator/coordinatorMode.ts` - System prompts, user context, mode switching
- `src/coordinator/workerAgent.ts` - Worker/reader agent prompts
- `src/commands/coordinator/coordinator.tsx` - /coordinator command handler

### Agent Tool Files
- `src/tools/AgentTool/AgentTool.tsx` - Main agent tool, result formatting
- `src/tools/AgentTool/agentToolUtils.ts` - Agent tool utilities, analytics
- `src/tools/AgentTool/runAgent.ts` - Agent execution
- `src/tools/AgentTool/prompt.ts` - Agent tool prompts

### Swarm/Teammate Files
- `src/utils/swarm/inProcessRunner.ts` - In-process teammate runner, message formatting
- `src/utils/swarm/spawnInProcess.ts` - In-process spawning, now supports `displayName`
- `src/utils/swarm/teammateInit.ts` - Teammate initialization
- `src/utils/teammateMailbox.ts` - Mailbox read/write

### UI Components (Modified)
- `src/components/PromptInput/PromptInput.tsx` - Fixed tearing, added displayName
- `src/components/PromptInput/useSwarmBanner.ts` - Fixed tearing, added displayName
- `src/components/TeammateViewHeader.tsx` - Added displayName support
- `src/components/messages/UserTeammateMessage.tsx` - Added displayName support
- `src/components/Spinner/TeammateSpinnerLine.tsx` - Added displayName support
- `src/components/Spinner/SpinnerAnimationRow.tsx` - Added displayName support
- `src/components/tasks/InProcessTeammateDetailDialog.tsx` - Added displayName support
- `src/components/tasks/BackgroundTasksDialog.tsx` - Added displayName support

### Types (Modified)
- `src/tasks/InProcessTeammateTask/types.ts` - Added `displayName`, `getTeammateDisplayName()`
- `src/utils/teammateContext.ts` - Added `displayName` to `TeammateContext`

---

## Changes Summary

### Bug Fixes
1. ✅ **Unified debug logging**: `appendDebugLog()` → `logForDebugging()` — all coordinator debug logs now controlled by `/debug`
2. ✅ **Fixed UI flickering**: Eliminated React tearing by replacing `store.getState()` with `useAppState()` in PromptInput and useSwarmBanner

### New Feature
3. ✅ **Worker display names**: Added optional `displayName` field — team-lead can assign human-readable names to workers without affecting communication routing

---

## 9. Worker Naming Fix — Descriptive Names Instead of Random Timestamps

### Problem
In coordinator mode, workers spawned without an explicit `name` defaulted to `worker-${Date.now()}` (e.g., `worker-1779352254981`), making them hard to identify.

### Root Cause
`AgentTool.tsx:699` used `name || \`worker-${Date.now()}\`` as the fallback.

### Fix
**File:** `src/tools/AgentTool/AgentTool.tsx` (lines 693-705)
- Derive a kebab-case name from the task `description` when `name` is not provided
- Pass `displayName: description.substring(0, 40)` to show a human-readable label in the UI
- Fallback to `worker-${Date.now()}` only if description is empty

```typescript
const workerName = name || description.toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .substring(0, 30) || `worker-${Date.now()}`
```

### Coordinator System Prompt Updated
**File:** `src/coordinator/coordinatorMode.ts` (lines 226-240)
- Added "Naming Workers" section to the Commander system prompt
- Instructs Commander to use the `name` parameter for descriptive kebab-case identifiers

---

## 10. Agent Persistence Across Projects

### Problem
Agents created via `/agents` and saved to `.claude/agents/` (project-local) are lost when the project is moved to a different directory.

### Root Cause
Agent definitions are loaded from multiple sources with a priority hierarchy. Project-local agents (`.claude/agents/`) are tied to the project directory and do not follow the project when moved.

### Agent Storage Locations
| Location | Path | Persistence |
|----------|------|-------------|
| Global (user) | `~/.dl/agents/` | ✅ Survives project moves |
| Project-local | `<project>/.claude/agents/` | ❌ Lost when project moves |
| Managed | `~/.dl/managed/.claude/agents/` | ✅ Managed by policy |

### Fix
**File:** `src/coordinator/coordinatorMode.ts` (lines 117-120)
- Added "Agent Persistence" section to the Commander system prompt
- Commander now advises users to save recurring agent patterns to `~/.dl/agents/` via `/agents` for cross-project persistence

---

## 11. React Infinite Loop Fix (Maximum Update Depth Exceeded)

### Problem
After the UI flickering fix, dl-code crashed with:
```
Maximum update depth exceeded. This can happen when a component repeatedly calls setState...
```

### Root Cause
`useAppState()` uses `useSyncExternalStoreWithSelector`, which does `===` comparison on the selector return value. Selectors that return new objects every call cause infinite re-render loops.

### Offending Code
1. **`useSwarmBanner.ts`** (original fix):
   ```typescript
   // ❌ Returns new object every time
   const active = useAppState(s => getActiveAgentForInput(s))
   ```

2. **`UserTeammateMessage.tsx`**:
   ```typescript
   // ❌ Returns new Map every time
   const displayNameMap = useAppState(s => {
     const map = new Map()
     ...
     return map
   })
   ```

### Fix
1. **`useSwarmBanner.ts`** — Replaced `getActiveAgentForInput()` selector with individual primitive selectors (`viewingAgentTaskId`, `tasks`) and manual logic:
   ```typescript
   const viewingAgentTaskId = useAppState(s => s.viewingAgentTaskId)
   const tasks = useAppState(s => s.tasks)
   ```

2. **`UserTeammateMessage.tsx`** — Moved object creation into `React.useMemo`:
   ```typescript
   const tasks = useAppState(s => s.tasks)
   const displayNameMap = React.useMemo(() => { ... }, [tasks])
   ```

### Key Lesson
Never pass a selector to `useAppState` that returns a newly constructed object/array/Map/Set. Always subscribe to primitive values, or wrap object creation in `useMemo`/`useCallback`.
