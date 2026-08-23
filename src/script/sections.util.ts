import fs from 'fs/promises';
import path from 'path';
import { ChannelContext, ScriptSectionDef } from '../channel/channel.types';
import { ScriptSectionsOutlineSchema } from '../types';

export const SECTIONS_FILENAME = 'sections.json';

export function getSectionsPath(projectDir: string): string {
  return path.join(projectDir, SECTIONS_FILENAME);
}

export async function loadScriptSections(
  projectDir: string,
  ctx: ChannelContext,
): Promise<ScriptSectionDef[]> {
  const sectionsPath = getSectionsPath(projectDir);
  try {
    const raw = await fs.readFile(sectionsPath, 'utf-8');
    return ScriptSectionsOutlineSchema.parse(JSON.parse(raw)).sections;
  } catch {
    return ctx.config.script.sections;
  }
}

export async function saveScriptSections(
  projectDir: string,
  sections: ScriptSectionDef[],
): Promise<void> {
  const sectionsPath = getSectionsPath(projectDir);
  await fs.writeFile(sectionsPath, JSON.stringify({ sections }, null, 2), 'utf-8');
}

export function getChapterLabels(sections: ScriptSectionDef[]): string[] {
  return sections.map((section) => section.label);
}
