import fs from 'fs/promises';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import {
  getDefaultsDir,
  PROFILE_FILE,
} from './shadowing.constants';
import { ShadowingContext, ShadowingProfile, ShadowingProfileSchema } from './shadowing.types';

export class ShadowingProfileService {
  constructor(private readonly rootDir = process.cwd()) {}

  getDefaultsDir(): string {
    return getDefaultsDir(this.rootDir);
  }

  async loadDefaults(): Promise<ShadowingContext> {
    return this.loadFromDir(getDefaultsDir(this.rootDir));
  }

  async loadFromDir(profileDir: string): Promise<ShadowingContext> {
    const configPath = path.join(profileDir, PROFILE_FILE);
    const raw = await fs.readFile(configPath, 'utf-8');
    const profile = ShadowingProfileSchema.parse(parseYaml(raw));

    const backgroundPath = path.resolve(profileDir, profile.assets.background);
    await fs.access(backgroundPath);

    return {
      profile,
      profileDir,
      speakerName: profile.speaker.name,
      voiceName: profile.speaker.voice,
      backgroundPath,
    };
  }

  resolveProfileDir(profilePath?: string): string {
    if (profilePath) {
      return path.resolve(profilePath);
    }
    return getDefaultsDir(this.rootDir);
  }
}
