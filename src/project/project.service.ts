import path from 'path';
import fs from 'fs/promises';
import { Project } from '../types';

const PROJECTS_DIR = path.join(process.cwd(), 'output', 'projects');

export class ProjectService {
  // ─── Public ──────────────────────────────────────────────────────────────

  async create(topic: string): Promise<Project> {
    const id = generateId();
    const project: Project = {
      id,
      topic,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await fs.mkdir(this.getDir(id), { recursive: true });
    await this.save(project);
    return project;
  }

  async load(id: string): Promise<Project> {
    const metaPath = path.join(this.getDir(id), 'project.json');
    const raw = await fs.readFile(metaPath, 'utf-8');
    return JSON.parse(raw) as Project;
  }

  async save(project: Project): Promise<void> {
    project.updatedAt = new Date().toISOString();
    const metaPath = path.join(this.getDir(project.id), 'project.json');
    await fs.writeFile(metaPath, JSON.stringify(project, null, 2), 'utf-8');
  }

  async list(): Promise<Project[]> {
    try {
      const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
      const projects: Project[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            projects.push(await this.load(entry.name));
          } catch {
            // skip corrupted/incomplete entries
          }
        }
      }
      return projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }

  getDir(id: string): string {
    return path.join(PROJECTS_DIR, id);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}-${time}`;
}
