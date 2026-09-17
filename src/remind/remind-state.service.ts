import fs from 'fs/promises';
import path from 'path';

interface ReminderState {
  lastSentDate: string;
}

const STATE_DIR = '.sewe';
const STATE_FILE = 'reminder-state.json';

export class RemindStateService {
  constructor(private readonly projectRoot: string) {}

  private getStatePath(): string {
    return path.join(this.projectRoot, STATE_DIR, STATE_FILE);
  }

  async getLastSentDate(): Promise<string | null> {
    try {
      const raw = await fs.readFile(this.getStatePath(), 'utf-8');
      const state = JSON.parse(raw) as ReminderState;
      return state.lastSentDate ?? null;
    } catch {
      return null;
    }
  }

  async markSent(todayIso: string): Promise<void> {
    const dir = path.join(this.projectRoot, STATE_DIR);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      this.getStatePath(),
      JSON.stringify({ lastSentDate: todayIso }, null, 2),
      'utf-8',
    );
  }
}

export function getTodayIso(timezone: string, date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Matches `.github/workflows/batch-reminder.yml`: Tue, Thu, Sat, Sun. */
const REMINDER_WEEKDAYS = new Set(['Tue', 'Thu', 'Sat', 'Sun']);

export function isReminderDayInTimezone(timezone: string, date = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(date);
  return REMINDER_WEEKDAYS.has(weekday);
}
