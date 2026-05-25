import figures from 'figures';
import { homedir } from 'os';
import * as React from 'react';
import { Box, Text } from '../../ink.js';
import type { Step } from '../../projectOnboardingState.js';
import { formatCreditAmount, getCachedReferrerReward } from '../../services/api/referral.js';
import type { LogOption } from '../../types/logs.js';
import { getCwd } from '../../utils/cwd.js';
import { formatRelativeTimeAgo } from '../../utils/format.js';
import type { FeedConfig, FeedLine } from './Feed.js';

export function createRecentActivityFeed(activities: LogOption[]): FeedConfig {
  const lines: FeedLine[] = activities.map(log => {
    const time = formatRelativeTimeAgo(log.modified);
    const description = log.summary && log.summary !== 'No prompt' ? log.summary : log.firstPrompt;
    return { text: description || '', timestamp: time };
  });
  return {
    title: 'Recent activity',
    lines,
    footer: lines.length > 0 ? '/resume for more' : undefined,
    emptyMessage: 'No recent activity',
  };
}

export function createWhatsNewFeed(releaseNotes: string[]): FeedConfig {
  const lines: FeedLine[] = releaseNotes.map((note) => ({ text: note }));
  return {
    title: "What's new",
    lines,
    footer: lines.length > 0 ? '/release-notes for more' : undefined,
    emptyMessage: 'No recent updates',
  };
}

export function createProjectOnboardingFeed(_steps: Step[]): FeedConfig {
  const lines: FeedLine[] = [
    { text: `Run ${figures.play} /init-memory to create a Hierarchical` },
    { text: 'Memory Framework (HMF) that organizes your' },
    { text: 'project into semantic layers, enabling better' },
    { text: 'context retention across sessions.' },
  ];
  const warningText =
    getCwd() === homedir()
      ? 'Tip: Launch dl-code in a project directory for the best experience.'
      : undefined;
  if (warningText) lines.push({ text: warningText });
  return { title: 'Tips for getting started', lines };
}

export function createGuestPassesFeed(): FeedConfig {
  const reward = getCachedReferrerReward();
  const subtitle = reward
    ? `Share Claude Code and earn ${formatCreditAmount(reward)} of extra usage`
    : 'Share Claude Code with friends';
  return {
    title: '3 guest passes',
    lines: [],
    customContent: {
      content: (
        <>
          <Box marginY={1}>
            <Text color="#00B4D8">{'[\u2727] [\u2727] [\u2727]'}</Text>
          </Box>
          <Text dimColor>{subtitle}</Text>
        </>
      ),
      width: 48,
    },
    footer: '/passes',
  };
}
