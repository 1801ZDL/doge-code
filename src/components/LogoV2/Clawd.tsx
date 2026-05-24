import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { env } from '../../utils/env.js'

export type ClawdPose =
  | 'default'
  | 'arms-up' // both arms raised (used during jump)
  | 'look-left' // both pupils shifted left
  | 'look-right'; // both pupils shifted right

type Props = {
  pose?: ClawdPose
}

// Standard-terminal pose fragments. All poses output the same 3-line "DL"
// block-character logo (11 cols wide).
type Segments = {
  /** row 1 left (no bg) */
  r1L: string
  /** row 1 eyes (with bg): full DL top row */
  r1E: string
  /** row 1 right (no bg) */
  r1R: string
  /** row 2 left (no bg) */
  r2L: string
  /** row 2 right (no bg) */
  r2R: string
}

const POSES: Record<ClawdPose, Segments> = {
  default: { r1L: ' \u2598', r1E: '████▝', r1R: '   █', r2L: '', r2R: '    █' },
  'look-left': { r1L: ' \u2598', r1E: '████▝', r1R: '   █', r2L: '', r2R: '    █' },
  'look-right': { r1L: ' \u2598', r1E: '████▝', r1R: '   █', r2L: '', r2R: '    █' },
  'arms-up': { r1L: ' \u2598', r1E: '████▝', r1R: '   █', r2L: '', r2R: '    █' }
}

export function Clawd({ pose = 'default' }: Props = {}): React.ReactNode {
  if (env.terminal === 'Apple_Terminal') {
    return <AppleTerminalClawd pose={pose} />
  }
  const p = POSES[pose]
  return (
    <Box flexDirection="column">
      <Text>
        <Text color="clawd_body">{p.r1L}</Text>
        <Text color="clawd_body" backgroundColor="clawd_background">
          {p.r1E}
        </Text>
        <Text color="clawd_body">{p.r1R}</Text>
      </Text>
      <Text>
        <Text color="clawd_body">{p.r2L}</Text>
        <Text color="clawd_body" backgroundColor="clawd_background">
          {'█    █'}
        </Text>
        <Text color="clawd_body">{p.r2R}</Text>
      </Text>
      <Text>
        <Text color="clawd_body">{' \u2596'}</Text>
        <Text color="clawd_body" backgroundColor="clawd_background">
          {'████▗'}
        </Text>
        <Text color="clawd_body">{' ███'}</Text>
      </Text>
    </Box>
  )
}

function AppleTerminalClawd({ pose }: { pose: ClawdPose }): React.ReactNode {
  return (
    <Box flexDirection="column" alignItems="center">
      <Text color="clawd_body">{' \u2598████▝   █'}</Text>
      <Text color="clawd_body">{'█    █    █'}</Text>
      <Text color="clawd_body">{' \u2596████▗ ███'}</Text>
    </Box>
  )
}
