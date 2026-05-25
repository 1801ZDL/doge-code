import * as React from 'react';
import { useState, useEffect } from 'react';
import { Box, Text } from '../../ink.js';
import { env } from '../../utils/env.js';

export type ClawdPose = 'default' | 'arms-up' | 'look-left' | 'look-right';

type Props = {
  pose?: ClawdPose;
};

// ANSI Shadow 风格的 DL Logo
const DL_LOGO = [
  "██████╗ ██╗     ",
  "██╔══██╗██║     ",
  "██║  ██║██║     ",
  "██║  ██║██║     ",
  "██████╔╝███████╗",
  "╚═════╝ ╚══════╝"
];

// 渐变色：从亮青色过渡到深蓝色
const WAVE_COLORS = [
  '#00FFFF', 
  '#00E5FF',
  '#00B4D8',
  '#0096C7',
  '#0077B6',
  '#023E8A'
];

// 定义八个方向的向量 [dx, dy]
const DIRECTIONS = [
  { name: '向下', dx: 0, dy: 1 },
  { name: '向上', dx: 0, dy: -1 },
  { name: '向右', dx: 1, dy: 0 },
  { name: '向左', dx: -1, dy: 0 },
  { name: '右下 (对角)', dx: 1, dy: 1 },
  { name: '左上 (对角)', dx: -1, dy: -1 },
  { name: '左下 (对角)', dx: -1, dy: 1 },
  { name: '右上 (对角)', dx: 1, dy: -1 },
];

export function Clawd({ pose = 'default' }: Props = {}): React.ReactNode {
  // 苹果原生终端依然保持静态，避免由于终端渲染机制导致的兼容性问题
  if (env.terminal === 'Apple_Terminal') {
    return <AppleTerminalClawd pose={pose} />;
  }

  const [tick, setTick] = useState(0);
  const [waveDir, setWaveDir] = useState(DIRECTIONS[0]);

  useEffect(() => {
    // 1. 组件挂载时，随机选择一个光波方向
    const randomDir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
    setWaveDir(randomDir);

    // 2. 驱动帧动画
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 80); 
    
    // 3. 核心修复：4 秒后自动停止动画（时间可自行微调）
    // 这样波浪会流转大约 50 帧，足够展示炫酷效果，随后定格，释放终端滚动条
    const stopTimer = setTimeout(() => {
      clearInterval(timer);
    }, 4000); 

    // 4. 清理函数：组件卸载时清除所有定时器
    return () => {
      clearInterval(timer);
      clearTimeout(stopTimer);
    };
  }, []);

  // 终端字符通常是长方形的（高大于宽），稍微缩放一下 X 轴的相位，让对角线波浪的倾斜角度更自然
  const X_SCALE = 0.6; 
  const totalColors = WAVE_COLORS.length;

  return (
    <Box flexDirection="column" marginY={1}>
      {DL_LOGO.map((line, y) => (
        <Text key={y}>
          {line.split('').map((char, x) => {
            // 优化：如果是空格，直接渲染，不参与颜色计算，节省一点点性能
            if (char === ' ') {
              return <Text key={`${y}-${x}`}> </Text>;
            }

            // 核心算法：计算当前字符在波浪中的相位 (二维点积)
            const phase = x * X_SCALE * waveDir.dx + y * waveDir.dy;
            
            // 结合 tick 让波浪移动，并处理负数取模的问题
            // (相减是为了让波浪沿着正向量方向移动)
            let colorIndex = Math.floor(phase - tick) % totalColors;
            if (colorIndex < 0) {
              colorIndex += totalColors;
            }
            
            return (
              <Text key={`${y}-${x}`} color={WAVE_COLORS[colorIndex]} bold>
                {char}
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