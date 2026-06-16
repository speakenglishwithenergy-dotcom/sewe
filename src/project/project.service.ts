import path from 'path';
import fs from 'fs/promises';
import { Project } from '../types';
import { DEFAULT_CHANNEL_ID } from '../channel/constants';

const OUTPUT_DIR = path.join(process.cwd(), 'output');
const LEGACY_PROJECTS_DIR = path.join(OUTPUT_DIR, 'projects');

function channelProjectsDir(channelId: string): string {
  return path.join(OUTPUT_DIR, channelId, 'projects');
}

export class ProjectService {
  async create(topic: string, channelId: string): Promise<Project> {
    const id = generateId();
    const project: Project = {
      id,
      channelId,
      topic,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await fs.mkdir(this.getDir(project), { recursive: true });
    await this.save(project);
    return project;
  }

  async load(id: string, channelId?: string): Promise<Project> {
    if (channelId) {
      return this.loadFromDir(this.getDir({ id, channelId } as Project));
    }

    const located = await this.findProjectDir(id);
    if (!located) {
      throw new Error(`Project "${id}" not found`);
    }
    return this.loadFromDir(located.dir);
  }

  async save(project: Project): Promise<void> {
    project.updatedAt = new Date().toISOString();
    const metaPath = path.join(this.getDir(project), 'project.json');
    await fs.writeFile(metaPath, JSON.stringify(project, null, 2), 'utf-8');
  }

  async list(channelId?: string): Promise<Project[]> {
    const projects: Project[] = [];

    if (channelId) {
      projects.push(...(await this.listInDir(channelProjectsDir(channelId))));
      return projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    projects.push(...(await this.listInDir(LEGACY_PROJECTS_DIR)));

    try {
      const channelEntries = await fs.readdir(OUTPUT_DIR, { withFileTypes: true });
      for (const entry of channelEntries) {
        if (!entry.isDirectory() || entry.name === 'projects') continue;
        const dir = channelProjectsDir(entry.name);
        projects.push(...(await this.listInDir(dir)));
      }
    } catch {
      // output dir may not exist yet
    }

    return projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getDir(project: Pick<Project, 'id' | 'channelId'>): string {
    return path.join(channelProjectsDir(project.channelId), project.id);
  }

  async resolveDir(id: string): Promise<string> {
    const located = await this.findProjectDir(id);
    if (!located) {
      throw new Error(`Project "${id}" not found`);
    }
    return located.dir;
  }

  private async loadFromDir(projectDir: string): Promise<Project> {
    const metaPath = path.join(projectDir, 'project.json');
    const raw = await fs.readFile(metaPath, 'utf-8');
    const project = JSON.parse(raw) as Partial<Project> & { id: string; topic: string };

    if (!project.channelId) {
      project.channelId = DEFAULT_CHANNEL_ID;
    }

    return project as Project;
  }

  private async findProjectDir(id: string): Promise<{ dir: string; channelId: string } | null> {
    const legacyDir = path.join(LEGACY_PROJECTS_DIR, id);
    if (await this.dirExists(legacyDir)) {
      const project = await this.loadFromDir(legacyDir);
      return { dir: legacyDir, channelId: project.channelId };
    }

    try {
      const channelEntries = await fs.readdir(OUTPUT_DIR, { withFileTypes: true });
      for (const entry of channelEntries) {
        if (!entry.isDirectory() || entry.name === 'projects') continue;
        const dir = path.join(channelProjectsDir(entry.name), id);
        if (await this.dirExists(dir)) {
          return { dir, channelId: entry.name };
        }
      }
    } catch {
      // ignore
    }

    return null;
  }

  private async listInDir(projectsDir: string): Promise<Project[]> {
    try {
      const entries = await fs.readdir(projectsDir, { withFileTypes: true });
      const projects: Project[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            projects.push(await this.loadFromDir(path.join(projectsDir, entry.name)));
          } catch {
            // skip corrupted/incomplete entries
          }
        }
      }
      return projects;
    } catch {
      return [];
    }
  }

  private async dirExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }
}

function generateId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}-${time}`;
}
