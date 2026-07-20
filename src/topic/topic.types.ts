import { WeekdayName } from '../social/schedule.util';

export type TopicStatus = 'pending' | 'generating' | 'generated' | 'published' | 'failed';

export interface TopicRecord {
  topic: string;
  projectId?: string;
  scheduledDate: string;
  weekday: WeekdayName;
  createdAt: string;
  status: TopicStatus;
}

export interface TopicRegistryFile {
  topics: TopicRecord[];
}
