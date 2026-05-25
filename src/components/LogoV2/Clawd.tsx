import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Box, Text } from '../../ink.js';
import { env } from '../../utils/env.js';

export type ClawdPose = 'default' | 'arms-up' | 'look-left' | 'look-right';

type Props = {
  pose?: ClawdPose;
};

// ANSI Shadow 风格的 DL Logo
const DL_LOGO = [
  '██████╗ ██╗     ',
  '██╔══██╗██║     ',
  '██║  ██║██║     ',
  '██║  ██║██║     ',
  '██████╔╝███████╗',
  '╚═════╝ ╚══════╝',
];

const ROWS = DL_LOGO.length;
const COLS = DL_LOGO[0].length;

// 渐变色：亮青 → 深蓝
const WAVE_COLORS = [
  '#00FFFF',
  '#00E5FF',
  '#00B4D8',
  '#0096C7',
  '#0077B6',
  '#023E8A',
];

// 终端字符高宽比约 2:1，对角波缩放 X 轴让视觉倾角接近真实 45°
const X_SCALE = 0.6;

// 8 种波光流转方向
const DIRECTIONS = [
  { dx: 0,  dy: 1  },
  { dx: 0,  dy: -1 },
  { dx: 1,  dy: 0  },
  { dx: -1, dy: 0  },
  { dx: 1,  dy: 1  },
  { dx: -1, dy: -1 },
  { dx: -1, dy: 1  },
  { dx: 1,  dy: -1 },
];

export function Clawd({ pose = 'default' }: Props = {}): React.ReactNode {
  if (env.terminal === 'Apple_Terminal') {
    return <AppleTerminalClawd pose={pose} />;
  }

  const [tick, setTick] = useState(0);
  const dirRef = useRef(DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)]);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 80);
    return () => clearInterval(timer);
  }, []);

  const { dx, dy } = dirRef.current;
  const N = WAVE_COLORS.length;

  return (
    <Box flexDirection="column" marginY={1}>
      {DL_LOGO.map((line, row) => (
        <Text key={row}>
          {[...line].map((ch, col) => {
            if (ch === ' ') {
              return <Text key={`${row}-${col}`}> </Text>;
            }
            const phase = Math.floor(col * X_SCALE * dx + row * dy - tick);
            const idx = ((phase % N) + N) % N;
            return (
              <Text key={`${row}-${col}`} color={WAVE_COLORS[idx]} bold>
                {ch}
              </Text>
            );
          })}
        </Text>
      ))}
    </Box>
  );
}

function AppleTerminalClawd({ pose }: { pose: ClawdPose }): React.ReactNode {
  return (
    <Box flexDirection="column" alignItems="center" marginY={1}>
      {DL_LOGO.map((line, i) => (
        <Text key={i} color="#00B4D8" bold>{line}</Text>
      ))}
    </Box>
  );
}
