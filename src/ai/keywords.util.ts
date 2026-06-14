import { CHANNEL_NAME } from '../prompts/script.prompt';

/** Maximum highlights burned into each subtitle line. */
export const MAX_KEYWORDS_PER_LINE = 4;

/** Branding phrases that must be highlighted whenever they appear in a line. */
export const ALWAYS_HIGHLIGHT_PHRASES = [CHANNEL_NAME];

const TOPIC_STOP_WORDS = new Set([
  'about', 'after', 'also', 'been', 'being', 'from', 'have', 'into', 'just', 'more',
  'that', 'their', 'them', 'then', 'they', 'this', 'through', 'understanding',
  'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your',
  'episode', 'english', 'learn', 'learners', 'listening', 'podcast', 'speak', 'energy',
]);

const CONTENT_STOP_WORDS = new Set([
  ...TOPIC_STOP_WORDS,
  'a', 'an', 'the', 'and', 'or', 'but', 'so', 'to', 'of', 'in', 'on', 'at', 'for',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'i', 'you', 'we', 'they', 'he', 'she', 'it', 'my', 'our', 'their', 'his', 'her', 'its',
  'this', 'that', 'these', 'those', 'here', 'there', 'today', 'very', 'just', 'also', 'even',
  'well', 'right', 'know', 'mean', 'actually', 'everyone', 'everybody', 'maybe', 'might',
  'could', 'would', 'should', 'can', 'will', 'don', 'doesn', 'didn', 'isn', 'aren', 'wasn',
  'lisa', 'victor', 'say', 'said', 'think', 'like', 'get', 'got', 'make', 'made', 'take',
  'tell', 'talk', 'ask', 'see', 'feel', 'want', 'need', 'going', 'come', 'back', 'still',
]);

/** Common spoken phrases worth highlighting when they appear verbatim. */
const LEARNABLE_PHRASES = [
  'romanticize the past',
  'rose-colored glasses',
  'living in the moment',
  'present moment',
  'highlight reel',
  'make sense',
  'makes sense',
  'look back',
  'look back fondly',
  'fall into the trap',
  'stay present',
  'personal development',
  'self-improvement',
  'communication skills',
  'gratitude journal',
  'joy journal',
  'positive change',
  'share memories',
  'good memories',
  'daily life',
  'ups and downs',
  'actionable tip',
  'every era',
  'back then',
  'diving into',
  'tuning in',
  'for sure',
  'great question',
  'good point',
  'I can relate',
  'can relate',
];

const PURE_SOCIAL_PATTERNS = [
  /^(hey everyone|hi there|hi!|thanks for tuning|thanks for listening|see you next|take care)/i,
  /^(exactly|right|yes|yeah|absolutely|totally|precisely)[,!]?\s*(Lisa|Victor)?[!.,?\s]*$/i,
  /^(great question|great idea|that's a good point|i see)[!.,]?\s*$/i,
];

/** Pull topic terms and phrases from the episode topic + title for keyword prioritization. */
export function extractTopicTerms(topic: string, title: string): string[] {
  const terms = new Set<string>();

  const addTerm = (term: string) => {
    const cleaned = term.trim().replace(/\s+/g, ' ');
    if (cleaned.length >= 3) {
      terms.add(cleaned);
    }
  };

  for (const segment of title.split(/[—–\-:?!,]/)) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 6) {
      addTerm(words.join(' '));
    }
    for (const word of words) {
      const lower = word.toLowerCase();
      if (word.length >= 4 && !TOPIC_STOP_WORDS.has(lower)) {
        addTerm(lower);
      }
    }
  }

  for (const word of topic.split(/\s+/)) {
    const lower = word.toLowerCase().replace(/[^a-z'-]/g, '');
    if (lower.length >= 4 && !TOPIC_STOP_WORDS.has(lower)) {
      addTerm(lower);
    }
  }

  return [...terms].sort((a, b) => b.length - a.length);
}

export function isPureSocialLine(text: string): boolean {
  return PURE_SOCIAL_PATTERNS.some((pattern) => pattern.test(text.trim()));
}

/** Target minimum highlights based on sentence length. */
export function minimumKeywordCount(text: string): number {
  if (isPureSocialLine(text)) {
    return 0;
  }
  const words = text.trim().split(/\s+/).length;
  if (words >= 18) {
    return 3;
  }
  if (words >= 10) {
    return 2;
  }
  if (words >= 5) {
    return 1;
  }
  return 0;
}

/** Lines that need a boost pass — too few highlights for their length. */
export function needsKeywordBoost(text: string, keywords: string[]): boolean {
  if (isPureSocialLine(text)) {
    return false;
  }
  return keywords.length < minimumKeywordCount(text);
}

/** Lines with zero highlights that might still deserve some. */
export function shouldAttemptGapFill(text: string): boolean {
  if (isPureSocialLine(text)) {
    return false;
  }
  return text.trim().split(/\s+/).length >= 4;
}

/** Add topic terms, learnable phrases, and content words until minimum is met. */
export function boostKeywordsLocally(
  text: string,
  keywords: string[],
  topicTerms: string[],
): string[] {
  if (isPureSocialLine(text)) {
    return [];
  }

  const result = [...keywords];
  const candidates = [
    ...topicTerms,
    ...findLearnablePhrasesInText(text),
    ...extractContentWords(text),
  ];

  for (const candidate of candidates) {
    if (result.length >= MAX_KEYWORDS_PER_LINE) {
      break;
    }
    if (result.some((keyword) => keyword.toLowerCase() === candidate.toLowerCase())) {
      continue;
    }
    if (keywordAppearsInText(text, candidate)) {
      result.push(candidate);
    }
  }

  return dedupeKeywords(result).slice(0, MAX_KEYWORDS_PER_LINE);
}

export function findLearnablePhrasesInText(text: string): string[] {
  const lower = text.toLowerCase();
  return LEARNABLE_PHRASES.filter((phrase) => {
    const pattern = buildKeywordRegex(phrase);
    return pattern.test(lower);
  }).sort((a, b) => b.length - a.length);
}

function extractContentWords(text: string): string[] {
  return (text.match(/[A-Za-z']+/g) ?? [])
    .map((word) => word.replace(/^'+|'+$/g, ''))
    .filter((word) => word.length >= 5 && !CONTENT_STOP_WORDS.has(word.toLowerCase()))
    .sort((a, b) => b.length - a.length);
}

/** Reserve slots for branding phrases first, then fill remaining budget. */
export function applyAlwaysHighlightPhrases(text: string, keywords: string[]): string[] {
  const always: string[] = [];

  for (const phrase of ALWAYS_HIGHLIGHT_PHRASES) {
    if (keywordAppearsInText(text, phrase)) {
      always.push(phrase);
    }
  }

  if (always.length === 0) {
    return dedupeKeywords(keywords).slice(0, MAX_KEYWORDS_PER_LINE);
  }

  const alwaysLower = new Set(always.map((phrase) => phrase.toLowerCase()));
  const rest = dedupeKeywords(keywords).filter(
    (keyword) => !alwaysLower.has(keyword.toLowerCase()),
  );
  const remaining = Math.max(0, MAX_KEYWORDS_PER_LINE - always.length);

  return [...always, ...rest.slice(0, remaining)];
}

export function dedupeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const keyword of keywords) {
    const key = keyword.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(keyword.trim());
  }
  return result;
}

/** Case-insensitive match; supports apostrophes, hyphens, and flexible whitespace. */
export function keywordAppearsInText(text: string, keyword: string): boolean {
  return buildKeywordRegex(keyword).test(text);
}

export function buildKeywordRegex(keyword: string): RegExp {
  const parts = keyword
    .trim()
    .split(/\s+/)
    .map((part) =>
      part
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/['']/g, "[''']?")
        .replace(/-/g, '-'),
    );

  const pattern = parts.join('\\s+');
  return new RegExp(`(?<![A-Za-z])${pattern}(?![A-Za-z])`, 'gi');
}
