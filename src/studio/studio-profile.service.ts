import fs from 'fs/promises';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import {
  buildStudioContext,
  ResolvedStudioAssets,
  StudioContext,
  StudioProfileConfig,
  StudioProfileConfigSchema,
  StudioScriptFormat,
} from './studio.types';
import { PROFILE_FILE } from './studio.constants';

/** Map legacy podcast-style profile.yaml (hosts + dialogueRules) to Studio format. */
function migrateLegacyProfile(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.voices || !raw.hosts) {
    return raw;
  }

  const hosts = raw.hosts as Array<{ name: string; voice: string; personality?: string }>;
  raw.voices = hosts.map((h) => ({
    name: h.name,
    voice: h.voice,
    role: h.personality,
  }));
  delete raw.hosts;

  const script = (raw.script as Record<string, unknown>) ?? {};
  if (!script.format) {
    script.format = inferFormatFromLegacy(script, hosts.length);
  }
  if (!script.lineRules && script.dialogueRules) {
    script.lineRules = String(script.dialogueRules);
    delete script.dialogueRules;
  }
  if (!script.flowExample && script.dialogueFlowExample) {
    script.flowExample = String(script.dialogueFlowExample);
    delete script.dialogueFlowExample;
  }
  if (!script.closingLine && script.closingTemplate) {
    const tpl = String(script.closingTemplate);
    script.closingLine = tpl.replace(/\{channelName\}/g, '{name}');
    delete script.closingTemplate;
  }
  raw.script = script;

  return raw;
}

function inferFormatFromLegacy(
  script: Record<string, unknown>,
  voiceCount: number,
): StudioScriptFormat {
  const rules = String(script.dialogueRules ?? script.lineRules ?? '').toLowerCase();
  if (rules.includes('tutorial') || rules.includes('step by step')) {
    return 'tutorial';
  }
  if (rules.includes('monologue') || rules.includes('single speaker')) {
    return 'monologue';
  }
  if (rules.includes('story')) {
    return 'story';
  }
  return voiceCount > 1 ? 'dialogue' : 'monologue';
}

export class StudioProfileService {
  private readonly studioRoot: string;

  constructor(studioRoot: string) {
    this.studioRoot = studioRoot;
  }

  async loadDefaults(): Promise<StudioContext> {
    const defaultsDir = path.join(this.studioRoot, 'defaults');
    return this.loadFromDir(defaultsDir);
  }

  async loadForWorkspace(workspaceDir: string): Promise<StudioContext> {
    const workspaceProfile = path.join(workspaceDir, PROFILE_FILE);
    try {
      await fs.access(workspaceProfile);
      return this.loadFromDir(workspaceDir);
    } catch {
      return this.loadDefaults();
    }
  }

  private async loadFromDir(profileDir: string): Promise<StudioContext> {
    const configPath = path.join(profileDir, PROFILE_FILE);
    const rawYaml = await fs.readFile(configPath, 'utf-8');
    const parsed = parseYaml(rawYaml) as Record<string, unknown>;
    const migrated = migrateLegacyProfile({ ...parsed });
    const config = StudioProfileConfigSchema.parse(migrated);
    const assets = this.resolveAssets(profileDir, config);
    return buildStudioContext(config, profileDir, assets);
  }

  private resolveAssets(profileDir: string, config: StudioProfileConfig): ResolvedStudioAssets {
    const resolve = (relativePath: string): string => path.join(profileDir, relativePath);

    return {
      background: resolve(config.assets.background),
    };
  }
}
