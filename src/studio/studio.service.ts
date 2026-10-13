import path from 'path';
import fs from 'fs/promises';
import {
  ASSETS_BRIEF_FILE,
  EDIT_GUIDE_FILE,
  OUTLINE_FILE,
  PROFILE_FILE,
  PUBLISH_DIR,
  REVISIONS_DIR,
  SCRIPT_FILE,
  SHADOWING_DIR,
  STUDIO_DEFAULTS_DIR,
  STUDIO_DIR,
  STUDIO_META_FILE,
  STUDIO_WORKSPACES_DIR,
  VIRAL_BRIEF_FILE,
} from './studio.constants';
import { StudioStatus, StudioWorkspace, StudioWorkspaceSchema } from './studio.types';

export class StudioService {
  private readonly rootDir: string;

  constructor(rootDir = process.cwd()) {
    this.rootDir = rootDir;
  }

  getStudioRoot(): string {
    return path.join(this.rootDir, STUDIO_DIR);
  }

  getDefaultsDir(): string {
    return path.join(this.getStudioRoot(), STUDIO_DEFAULTS_DIR);
  }

  getWorkspacesDir(): string {
    return path.join(this.getStudioRoot(), STUDIO_WORKSPACES_DIR);
  }

  getWorkspaceDir(workspace: Pick<StudioWorkspace, 'id'>): string {
    return path.join(this.getWorkspacesDir(), workspace.id);
  }

  async create(topic: string): Promise<StudioWorkspace> {
    const id = generateStudioId();
    const workspace: StudioWorkspace = {
      id,
      topic,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const dir = this.getWorkspaceDir(workspace);
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, REVISIONS_DIR), { recursive: true });
    await fs.mkdir(path.join(dir, SHADOWING_DIR), { recursive: true });
    await fs.mkdir(path.join(dir, PUBLISH_DIR), { recursive: true });

    await this.copyDefaultProfile(dir);
    await this.save(workspace);

    return workspace;
  }

  async load(id: string): Promise<StudioWorkspace> {
    const dir = path.join(this.getWorkspacesDir(), id);
    if (!(await this.dirExists(dir))) {
      throw new Error(`Studio workspace "${id}" not found`);
    }
    return this.loadFromDir(dir);
  }

  async save(workspace: StudioWorkspace): Promise<void> {
    workspace.updatedAt = new Date().toISOString();
    const metaPath = path.join(this.getWorkspaceDir(workspace), STUDIO_META_FILE);
    await fs.writeFile(metaPath, JSON.stringify(workspace, null, 2), 'utf-8');
  }

  async updateStatus(workspace: StudioWorkspace, status: StudioStatus): Promise<StudioWorkspace> {
    workspace.status = status;
    await this.save(workspace);
    return workspace;
  }

  async list(): Promise<StudioWorkspace[]> {
    const workspacesDir = this.getWorkspacesDir();
    try {
      const entries = await fs.readdir(workspacesDir, { withFileTypes: true });
      const workspaces: StudioWorkspace[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          workspaces.push(await this.loadFromDir(path.join(workspacesDir, entry.name)));
        } catch {
          // skip invalid entries
        }
      }

      return workspaces.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }

  getOutlinePath(workspaceDir: string): string {
    return path.join(workspaceDir, OUTLINE_FILE);
  }

  getScriptPath(workspaceDir: string): string {
    return path.join(workspaceDir, SCRIPT_FILE);
  }

  getEditGuidePath(workspaceDir: string): string {
    return path.join(workspaceDir, EDIT_GUIDE_FILE);
  }

  getAssetsBriefPath(workspaceDir: string): string {
    return path.join(workspaceDir, ASSETS_BRIEF_FILE);
  }

  getViralBriefPath(workspaceDir: string): string {
    return path.join(workspaceDir, PUBLISH_DIR, VIRAL_BRIEF_FILE);
  }

  getPublishDir(workspaceDir: string): string {
    return path.join(workspaceDir, PUBLISH_DIR);
  }

  getShadowingDir(workspaceDir: string): string {
    return path.join(workspaceDir, SHADOWING_DIR);
  }

  getRevisionsDir(workspaceDir: string): string {
    return path.join(workspaceDir, REVISIONS_DIR);
  }

  async saveRevision(workspaceDir: string, script: unknown, revisionNumber: number): Promise<string> {
    const revisionsDir = this.getRevisionsDir(workspaceDir);
    await fs.mkdir(revisionsDir, { recursive: true });
    const revisionPath = path.join(
      revisionsDir,
      `script-${String(revisionNumber).padStart(3, '0')}.json`,
    );
    await fs.writeFile(revisionPath, JSON.stringify(script, null, 2), 'utf-8');
    return revisionPath;
  }

  async nextRevisionNumber(workspaceDir: string): Promise<number> {
    const revisionsDir = this.getRevisionsDir(workspaceDir);
    try {
      const entries = await fs.readdir(revisionsDir);
      const numbers = entries
        .map((name) => {
          const match = name.match(/^script-(\d+)\.json$/);
          return match ? Number(match[1]) : 0;
        })
        .filter((n) => n > 0);
      return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    } catch {
      return 1;
    }
  }

  private async loadFromDir(workspaceDir: string): Promise<StudioWorkspace> {
    const metaPath = path.join(workspaceDir, STUDIO_META_FILE);
    const raw = await fs.readFile(metaPath, 'utf-8');
    return StudioWorkspaceSchema.parse(JSON.parse(raw));
  }

  private async copyDefaultProfile(workspaceDir: string): Promise<void> {
    const defaultProfile = path.join(this.getDefaultsDir(), PROFILE_FILE);
    const targetProfile = path.join(workspaceDir, PROFILE_FILE);
    await fs.copyFile(defaultProfile, targetProfile);
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

function generateStudioId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}-${time}`;
}
