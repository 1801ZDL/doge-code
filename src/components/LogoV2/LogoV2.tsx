import * as React from 'react';
import { useEffect, useState } from 'react';
import { Box, Text } from '../../ink.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { stringWidth } from '../../ink/stringWidth.js';
import {
  getLayoutMode,
  formatWelcomeMessage,
  truncatePath,
  getRecentActivitySync,
  getRecentReleaseNotesSync,
  getLogoDisplayData,
} from '../../utils/logoV2Utils.js';
import { truncate } from '../../utils/format.js';
import { Clawd } from './Clawd.js';
import { Feed } from './Feed.js';
import {
  createRecentActivityFeed,
  createWhatsNewFeed,
  createProjectOnboardingFeed,
  createGuestPassesFeed,
} from './feedConfigs.js';
import { getGlobalConfig, saveGlobalConfig } from 'src/utils/config.js';
import { getInitialSettings } from 'src/utils/settings/settings.js';
import { isDebugMode, isDebugToStdErr, getDebugLogPath } from 'src/utils/debug.js';
import {
  getSteps,
  shouldShowProjectOnboarding,
  incrementProjectOnboardingSeenCount,
} from '../../projectOnboardingState.js';
import { OffscreenFreeze } from '../OffscreenFreeze.js';
import { checkForReleaseNotesSync } from '../../utils/releaseNotes.js';
import { isEnvTruthy } from 'src/utils/envUtils.js';
import { EmergencyTip } from './EmergencyTip.js';
import { VoiceModeNotice } from './VoiceModeNotice.js';
import { KirakiraNotice } from './KirakiraNotice.js';
import { feature } from 'bun:bundle';
import { SandboxManager } from 'src/utils/sandbox/sandbox-adapter.js';
import {
  useShowGuestPassesUpsell,
  incrementGuestPassesSeenCount,
} from './GuestPassesUpsell.js';
import {
  useShowOverageCreditUpsell,
  incrementOverageCreditUpsellSeenCount,
  createOverageCreditFeed,
} from './OverageCreditUpsell.js';
import { useAppState } from '../../state/AppState.js';
import { getEffortSuffix } from '../../utils/effort.js';
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js';
import { renderModelSetting } from '../../utils/model/model.js';

/* eslint-disable @typescript-eslint/no-require-imports */
const ChannelsNoticeModule =
  feature('KAIROS') || feature('KAIROS_CHANNELS')
    ? (require('./ChannelsNotice.js') as typeof import('./ChannelsNotice.js'))
    : null;
/* eslint-enable @typescript-eslint/no-require-imports */

const LEFT_PANEL_MAX_WIDTH = 50;

export function LogoV2() {
  const activities = getRecentActivitySync();
  const username = getGlobalConfig().oauthAccount?.displayName ?? '';
  const { columns } = useTerminalSize();
  const showOnboarding = shouldShowProjectOnboarding();
  const showSandboxStatus = SandboxManager.isSandboxingEnabled();
  const showGuestPassesUpsell = useShowGuestPassesUpsell();
  const showOverageCreditUpsell = useShowOverageCreditUpsell();
  const agent = useAppState((s) => s.agent);
  const effortValue = useAppState((s) => s.effortValue);
  const config = getGlobalConfig();

  let changelog: string[];
  try {
    changelog = getRecentReleaseNotesSync(3);
  } catch {
    changelog = [];
  }

  const [announcement] = useState(() => {
    const announcements = getInitialSettings().companyAnnouncements;
    if (!announcements || announcements.length === 0) return;
    return config.numStartups === 1
      ? announcements[0]
      : announcements[Math.floor(Math.random() * announcements.length)];
  });

  const { hasReleaseNotes } = checkForReleaseNotesSync(config.lastReleaseNotesSeen);

  useEffect(() => {
    const currentConfig = getGlobalConfig();
    if (currentConfig.lastReleaseNotesSeen === MACRO.VERSION) return;
    saveGlobalConfig((c) =>
      c.lastReleaseNotesSeen === MACRO.VERSION
        ? c
        : { ...c, lastReleaseNotesSeen: MACRO.VERSION },
    );
    if (showOnboarding) incrementProjectOnboardingSeenCount();
  }, [config, showOnboarding]);

  const isCondensedMode =
    !hasReleaseNotes &&
    !showOnboarding &&
    !isEnvTruthy(process.env.DL_CODE_FORCE_FULL_LOGO);

  useEffect(() => {
    if (showGuestPassesUpsell && !showOnboarding && !isCondensedMode) {
      incrementGuestPassesSeenCount();
    }
  }, [showGuestPassesUpsell, showOnboarding, isCondensedMode]);

  useEffect(() => {
    if (
      showOverageCreditUpsell &&
      !showOnboarding &&
      !showGuestPassesUpsell &&
      !isCondensedMode
    ) {
      incrementOverageCreditUpsellSeenCount();
    }
  }, [showOverageCreditUpsell, showOnboarding, showGuestPassesUpsell, isCondensedMode]);

  const model = useMainLoopModel();
  const fullModelDisplayName = renderModelSetting(model);
  const { version, cwd, billingType, agentName: agentNameFromSettings } =
    getLogoDisplayData();
  const agentName = agent ?? agentNameFromSettings;
  const effortSuffix = getEffortSuffix(model, effortValue);
  const modelDisplayName = truncate(
    fullModelDisplayName + effortSuffix,
    LEFT_PANEL_MAX_WIDTH - 20,
  );

  const layoutMode = getLayoutMode(columns);
  const welcomeMessage = formatWelcomeMessage(username);
  const modelLine = !process.env.IS_DEMO && config.oauthAccount?.organizationName
    ? `${modelDisplayName} · ${billingType} · ${config.oauthAccount.organizationName}`
    : `${modelDisplayName} · ${billingType}`;
  const cwdAvailableWidth = agentName
    ? columns - 4 - 1 - stringWidth(agentName) - 3
    : columns - 4;
  const truncatedCwd = truncatePath(cwd, Math.max(cwdAvailableWidth, 10));
  const cwdLine = agentName
    ? `@${agentName} · ${truncatedCwd}`
    : truncatedCwd;

  const whatsNewFeed = createWhatsNewFeed(changelog);
  const tipsFeed = createProjectOnboardingFeed(getSteps());
  const rightFeeds = showGuestPassesUpsell
    ? [whatsNewFeed, createGuestPassesFeed()]
    : showOverageCreditUpsell
      ? [whatsNewFeed, createOverageCreditFeed()]
      : [whatsNewFeed, tipsFeed];

  const feedWidth = Math.max(20, (columns - 10) / 2);
  const showFeeds = layoutMode !== 'compact' && feedWidth >= 35;

  return (
    <>
      <OffscreenFreeze>
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="#00B4D8"
          borderText={{
            content: ` DeLong Code  v${version} `,
            position: 'top',
            align: 'start',
            offset: 3,
          }}
          paddingX={2}
          paddingY={1}
          alignItems="center"
        >
          <Box marginY={1}>
            <Text bold>{welcomeMessage}</Text>
          </Box>
          <Clawd />
          <Box flexDirection="column" alignItems="center" marginBottom={1}>
            <Text dimColor>{modelLine}</Text>
            <Text dimColor>{cwdLine}</Text>
          </Box>
          {showFeeds && (
            <>
              <Box
                width="100%"
                borderStyle="single"
                borderColor="#00B4D8"
                borderDimColor
                borderLeft={false}
                borderRight={false}
                borderTop={false}
              />
              <Box flexDirection="row" marginTop={1} gap={2}>
                {rightFeeds.map((feed, i) => (
                  <Feed key={i} config={feed} actualWidth={feedWidth} />
                ))}
              </Box>
            </>
          )}
        </Box>
      </OffscreenFreeze>

      <VoiceModeNotice />
      <KirakiraNotice />
      {ChannelsNoticeModule && <ChannelsNoticeModule.ChannelsNotice />}
      {isDebugMode() && (
        <Box paddingLeft={2} flexDirection="column">
          <Text color="warning">Debug mode enabled</Text>
          <Text dimColor>
            Logging to: {isDebugToStdErr() ? 'stderr' : getDebugLogPath()}
          </Text>
        </Box>
      )}
      <EmergencyTip />
      {process.env.DL_CODE_TMUX_SESSION && (
        <Box paddingLeft={2} flexDirection="column">
          <Text dimColor>tmux session: {process.env.DL_CODE_TMUX_SESSION}</Text>
          <Text dimColor>
            {process.env.DL_CODE_TMUX_PREFIX_CONFLICTS
              ? `Detach: ${process.env.DL_CODE_TMUX_PREFIX} ${process.env.DL_CODE_TMUX_PREFIX} d`
              : `Detach: ${process.env.DL_CODE_TMUX_PREFIX} d`}
          </Text>
        </Box>
      )}
      {announcement && (
        <Box paddingLeft={2} flexDirection="column">
          {!process.env.IS_DEMO && config.oauthAccount?.organizationName && (
            <Text dimColor>
              Message from {config.oauthAccount.organizationName}:
            </Text>
          )}
          <Text>{announcement}</Text>
        </Box>
      )}
      {showSandboxStatus && (
        <Box paddingLeft={2} flexDirection="column">
          <Text color="warning">
            Your bash commands will be sandboxed. Disable with /sandbox.
          </Text>
        </Box>
      )}
    </>
  );
}
