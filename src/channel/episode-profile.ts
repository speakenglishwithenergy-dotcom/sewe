import { ChannelConfig } from './channel.types';
import { logger } from '../utils/logger';

export type EpisodeProfile = 'production' | 'test';

/** CI / manual GitHub Actions test: ~30–60s short, compact podcast stub. */
export const TEST_SHORT_MIN_SECONDS = 30;
export const TEST_SHORT_MAX_SECONDS = 60;
export const TEST_SHORT_MIN_WORDS = 50;
export const TEST_SHORT_MAX_WORDS = 100;
export const TEST_SHORT_MIN_LINES = 5;
export const TEST_SHORT_MAX_LINES = 8;

const PRODUCTION_SHORT_MIN_SECONDS = 90;
const PRODUCTION_SHORT_MAX_SECONDS = 120;
const PRODUCTION_SHORT_MIN_WORDS = 150;
const PRODUCTION_SHORT_MAX_WORDS = 220;

export function resolveEpisodeProfile(
  env: NodeJS.ProcessEnv = process.env,
): EpisodeProfile {
  const raw = env.EPISODE_PROFILE?.trim().toLowerCase();
  if (raw === 'test') return 'test';
  return 'production';
}

export function isTestEpisodeProfile(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveEpisodeProfile(env) === 'test';
}

/**
 * Shrink script + short targets for fast CI / manual Action test runs.
 * Mutates a copy of the channel config (does not write channel.yaml).
 */
export function applyEpisodeProfile(config: ChannelConfig): ChannelConfig {
  if (!isTestEpisodeProfile()) return config;

  logger.info(
    'Episode profile: test — compact podcast stub + short target ~30–60s',
  );

  return {
    ...config,
    script: {
      ...config.script,
      targetMinWords: 80,
      targetMinLines: 8,
      sections: [
        {
          id: 'quick-tip',
          label: 'Quick tip',
          lineCount: 8,
          brief:
            'One sharp practical tip on the topic in a short host exchange — hook, tip, example, close.',
        },
      ],
    },
    short: {
      ...config.short,
      minLines: TEST_SHORT_MIN_LINES,
      maxLines: TEST_SHORT_MAX_LINES,
    },
  };
}

export function shortDurationTargets(env: NodeJS.ProcessEnv = process.env): {
  minSeconds: number;
  maxSeconds: number;
  minWords: number;
  maxWords: number;
} {
  if (isTestEpisodeProfile(env)) {
    return {
      minSeconds: TEST_SHORT_MIN_SECONDS,
      maxSeconds: TEST_SHORT_MAX_SECONDS,
      minWords: TEST_SHORT_MIN_WORDS,
      maxWords: TEST_SHORT_MAX_WORDS,
    };
  }
  return {
    minSeconds: PRODUCTION_SHORT_MIN_SECONDS,
    maxSeconds: PRODUCTION_SHORT_MAX_SECONDS,
    minWords: PRODUCTION_SHORT_MIN_WORDS,
    maxWords: PRODUCTION_SHORT_MAX_WORDS,
  };
}
