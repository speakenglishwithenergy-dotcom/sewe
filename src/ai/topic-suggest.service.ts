import { z } from 'zod';
import { ChannelContext } from '../channel/channel.types';
import {
  buildTopicSuggestPrompt,
  buildTopicSuggestSystemPrompt,
} from '../prompts/topic-suggest.prompt';
import { BatchCount } from '../batch/batch.types';
import { logger } from '../utils/logger';
import { OpenAIService } from './openai.service';

function buildTopicSuggestSchema(count: BatchCount) {
  return z.object({
    topics: z.array(z.string().min(3)).length(count),
  });
}

export class TopicSuggestService {
  constructor(
    private readonly openai: OpenAIService,
    private readonly ctx: ChannelContext,
  ) {}

  async suggest(pastTopics: string[], count: BatchCount): Promise<string[]> {
    logger.info(`Generating ${count} topic suggestions...`);

    const result = await this.openai.generateJSON(
      buildTopicSuggestPrompt(this.ctx, { pastTopics, count }),
      buildTopicSuggestSystemPrompt(),
      (data) => buildTopicSuggestSchema(count).parse(data),
      { temperature: 0.9 },
    );

    const topics = result.topics.map((topic) => topic.trim()).filter(Boolean);
    if (topics.length !== count) {
      throw new Error(`Expected ${count} topics, got ${topics.length}`);
    }

    logger.success('Topic suggestions ready');
    return topics;
  }
}
