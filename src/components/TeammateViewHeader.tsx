import { c as _c } from "react/compiler-runtime";
import * as React from 'react';
import { Box, Text } from '../ink.js';
import { useAppState } from '../state/AppState.js';
import { getViewedTeammateTask } from '../state/selectors.js';
import { isLocalAgentTask } from '../tasks/LocalAgentTask/LocalAgentTask.js';
import { toInkColor } from '../utils/ink.js';
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js';
import { OffscreenFreeze } from './OffscreenFreeze.js';

/**
 * Header shown when viewing a teammate's transcript.
 * Displays teammate name (colored), task description, and exit hint.
 */
export function TeammateViewHeader() {
  const $ = _c(14);
  const viewedTeammate = useAppState(_temp);
  if (!viewedTeammate) {
    return null;
  }
  let t0;
  if ($[0] !== viewedTeammate.identity.color) {
    t0 = toInkColor(viewedTeammate.identity.color);
    $[0] = viewedTeammate.identity.color;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  const nameColor = t0;
  let t1;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = <Text>Viewing </Text>;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] !== nameColor || $[4] !== viewedTeammate.identity.agentName) {
    t2 = <Text color={nameColor} bold={true}>@{viewedTeammate.identity.agentName}</Text>;
    $[3] = nameColor;
    $[4] = viewedTeammate.identity.agentName;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  let t3;
  if ($[6] === Symbol.for("react.memo_cache_sentinel")) {
    t3 = <Text dimColor={true}>{" \xB7 "}<KeyboardShortcutHint shortcut="esc" action="return" /></Text>;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] !== t2) {
    t4 = <Box>{t1}{t2}{t3}</Box>;
    $[7] = t2;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  let t5;
  if ($[9] !== viewedTeammate.prompt) {
    t5 = <Text dimColor={true}>{viewedTeammate.prompt}</Text>;
    $[9] = viewedTeammate.prompt;
    $[10] = t5;
  } else {
    t5 = $[10];
  }
  let t6;
  if ($[11] !== t4 || $[12] !== t5) {
    t6 = <OffscreenFreeze><Box flexDirection="column" marginBottom={1}>{t4}{t5}</Box></OffscreenFreeze>;
    $[11] = t4;
    $[12] = t5;
    $[13] = t6;
  } else {
    t6 = $[13];
  }
  return t6;
}
function _temp(s) {
  return getViewedTeammateTask(s);
}

/**
 * Header shown when viewing a LocalAgentTask (coordinator-spawned async agent).
 * Displays agent type, description, and exit hint so users know how to return.
 */
export function AgentViewHeader() {
  const $ = _c(16);
  const viewedLocalAgent = useAppState(_agentTemp);
  if (!viewedLocalAgent) {
    return null;
  }
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = <Text>Viewing </Text>;
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  let t1;
  if ($[1] !== viewedLocalAgent.selectedAgent?.agentType || $[2] !== viewedLocalAgent.description) {
    t1 = <Text bold={true}>{viewedLocalAgent.selectedAgent?.agentType ?? 'agent'}{viewedLocalAgent.description ? ` › ${viewedLocalAgent.description}` : ''}</Text>;
    $[1] = viewedLocalAgent.selectedAgent?.agentType;
    $[2] = viewedLocalAgent.description;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  let t2;
  if ($[4] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = <Text dimColor={true}>{" \xB7 "}<KeyboardShortcutHint shortcut="esc" action="return" /></Text>;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  let t3;
  if ($[5] !== t1) {
    t3 = <Box>{t0}{t1}{t2}</Box>;
    $[5] = t1;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] !== viewedLocalAgent.prompt) {
    t4 = <Text dimColor={true}>{viewedLocalAgent.prompt.length > 200 ? viewedLocalAgent.prompt.substring(0, 200) + "\u2026" : viewedLocalAgent.prompt}</Text>;
    $[7] = viewedLocalAgent.prompt;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  let t5;
  if ($[9] !== t3 || $[10] !== t4) {
    t5 = <OffscreenFreeze><Box flexDirection="column" marginBottom={1}>{t3}{t4}</Box></OffscreenFreeze>;
    $[9] = t3;
    $[10] = t4;
    $[11] = t5;
  } else {
    t5 = $[11];
  }
  return t5;
}
function _agentTemp(s) {
  const id = s.viewingAgentTaskId;
  if (!id) return undefined;
  const task = s.tasks[id];
  if (!task || !isLocalAgentTask(task)) return undefined;
  return task;
}
