import path from 'path';
import fs from 'fs/promises';
import {
  DRAFT_FILE,
  getWorkspacesRoot,
  REVIEW_FILE,
  SCRIPT_FILE,
  SHADOWING_OUTPUT_DIR,
  WORKSPACE_META_FILE,
} from './shadowing.constants';
import { ShadowingWorkspace, ShadowingWorkspaceSchema } from './shadowing.types';

export class ShadowingWorkspaceService {
  constructor(private readonly rootDir = process.cwd()) {}

  getWorkspacesRoot(): string {
    return getWorkspacesRoot(this.rootDir);
  }

  getDir(workspace: Pick<ShadowingWorkspace, 'id'>): string {
    return path.join(this.getWorkspacesRoot(), workspace.id);
  }

  getShadowingDir(workspace: Pick<ShadowingWorkspace, 'id'>): string {
    return path.join(this.getDir(workspace), SHADOWING_OUTPUT_DIR);
  }

  getDraftPath(workspace: Pick<ShadowingWorkspace, 'id'>): string {
    return path.join(this.getDir(workspace), DRAFT_FILE);
  }

  getReviewPath(workspace: Pick<ShadowingWorkspace, 'id'>): string {
    return path.join(this.getDir(workspace), REVIEW_FILE);
  }

  getScriptPath(workspace: Pick<ShadowingWorkspace, 'id'>): string {
    return path.join(this.getDir(workspace), SCRIPT_FILE);
  }

  async create(draftContent: string, title?: string): Promise<ShadowingWorkspace> {
    const id = generateWorkspaceId();
    const now = new Date().toISOString();
    const workspace: ShadowingWorkspace = {
      id,
      title,
      createdAt: now,
      updatedAt: now,
    };

    const dir = this.getDir(workspace);
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(this.getShadowingDir(workspace), { recursive: true });
    await fs.writeFile(this.getDraftPath(workspace), draftContent, 'utf-8');
    await this.save(workspace);

    return workspace;
  }

  async load(id: string): Promise<ShadowingWorkspace> {
    const dir = path.join(this.getWorkspacesRoot(), id);
    const metaPath = path.join(dir, WORKSPACE_META_FILE);

    try {
      const raw = await fs.readFile(metaPath, 'utf-8');
      return ShadowingWorkspaceSchema.parse(JSON.parse(raw));
    } catch {
      throw new Error(`Shadowing workspace "${id}" not found at ${dir}`);
    }
  }

  async save(workspace: ShadowingWorkspace): Promise<void> {
    workspace.updatedAt = new Date().toISOString();
    const metaPath = path.join(this.getDir(workspace), WORKSPACE_META_FILE);
    await fs.writeFile(metaPath, JSON.stringify(workspace, null, 2), 'utf-8');
  }

  async list(): Promise<ShadowingWorkspace[]> {
    const root = this.getWorkspacesRoot();
    let entries;
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      return [];
    }

    const workspaces: ShadowingWorkspace[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        workspaces.push(await this.load(entry.name));
      } catch {
        // skip invalid dirs
      }
    }

    return workspaces.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async readDraft(workspace: ShadowingWorkspace): Promise<string> {
    const content = await fs.readFile(this.getDraftPath(workspace), 'utf-8');
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error(`Draft is empty: ${this.getDraftPath(workspace)}`);
    }
    return trimmed;
  }

  async readReview(workspace: ShadowingWorkspace): Promise<string> {
    const content = await fs.readFile(this.getReviewPath(workspace), 'utf-8');
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error(`Review file is empty: ${this.getReviewPath(workspace)}`);
    }
    return trimmed;
  }
}

function generateWorkspaceId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}-${time}`;
}
