import { ChannelContext } from '../channel/channel.types';

export interface TopicSuggestPromptContext {
  pastTopics: string[];
  count: number;
}

export function buildTopicSuggestSystemPrompt(): string {
  return 'You are a creative podcast producer for English-learning content. Respond only with valid JSON.';
}

export function buildTopicSuggestPrompt(
  ctx: ChannelContext,
  context: TopicSuggestPromptContext,
): string {
  const pastTopicsBlock =
    context.pastTopics.length > 0
      ? context.pastTopics.map((topic) => `- ${topic}`).join('\n')
      : '- (none yet)';

  const topicExamples =
    context.count === 1
      ? '["Topic 1"]'
      : context.count === 2
        ? '["Topic 1", "Topic 2"]'
        : '["Topic 1", "Topic 2", "Topic 3"]';

  return `Suggest exactly ${context.count} NEW podcast episode topics for the channel "${ctx.config.name}".

Channel niche: ${ctx.config.niche}
Target level: ${ctx.config.script.languageLevel}
Hosts: ${ctx.speakers.join(', ')}

Topics already covered (DO NOT repeat or closely rephrase):
${pastTopicsBlock}

Requirements:
- Each topic must be distinct from the others and from past topics
- Practical, relatable everyday English themes for ${ctx.config.script.languageLevel} learners
- Suitable for a 10–15 minute conversational podcast between two hosts
- Clear, specific angle — avoid vague titles like "Improve Your English"
- Title-style phrasing (not a full sentence question unless it works as a hook)

Return JSON:
{
  "topics": ${topicExamples}
}`;
}
