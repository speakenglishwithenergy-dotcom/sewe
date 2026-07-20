import { spawn } from 'child_process';
import { logger } from '../utils/logger';

export function runGenerateProject(projectId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'generate', '--', `--project=${projectId}`], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Generate failed for project ${projectId} (exit code ${code})`));
    });
  });
}

export async function runGenerateProjectWithLog(projectId: string, topic: string): Promise<void> {
  logger.divider('─');
  logger.info(`Generating project ${projectId} — "${topic}"`);
  logger.divider('─');
  await runGenerateProject(projectId);
}
