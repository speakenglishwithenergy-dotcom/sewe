/** Maximum highlights burned into each subtitle line. */
export const MAX_KEYWORDS_PER_LINE = 4;

const TOPIC_STOP_WORDS = new Set([
  'about', 'after', 'also', 'been', 'being', 'from', 'have', 'into', 'just', 'more',
  'that', 'their', 'them', 'then', 'they', 'this', 'through', 'understanding',
  'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your',
  'episode', 'english', 'learn', 'learners', 'listening', 'podcast', 'speak', 'energy',
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

/** Target minimum highlights — only used to nudge lines with zero highlights. */
export function minimumKeywordCount(text: string): number {
  if (isPureSocialLine(text)) {
    return 0;
  }
  return text.trim().split(/\s+/).length >= 5 ? 1 : 0;
}

/** Lines that need a boost pass — substantive lines still missing any highlight. */
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

/** Multi-word topic terms first, then single-word terms. */
export function partitionTopicTerms(topicTerms: string[]): {
  phrases: string[];
  singles: string[];
} {
  const phrases: string[] = [];
  const singles: string[] = [];

  for (const term of topicTerms) {
    if (term.trim().split(/\s+/).length >= 2) {
      phrases.push(term);
    } else {
      singles.push(term);
    }
  }

  return { phrases, singles };
}

/** Drop single-word keywords already covered by a longer highlighted phrase. */
export function pruneSubsumedSingleWords(keywords: string[]): string[] {
  const phrases = keywords.filter((keyword) => keyword.trim().split(/\s+/).length >= 2);
  const singles = keywords.filter((keyword) => keyword.trim().split(/\s+/).length === 1);

  if (phrases.length === 0) {
    return keywords;
  }

  const prunedSingles = singles.filter((single) => {
    const singleLower = single.toLowerCase();
    return !phrases.some((phrase) =>
      phrase
        .toLowerCase()
        .split(/\s+/)
        .some((word) => word === singleLower),
    );
  });

  return [...phrases, ...prunedSingles];
}

/** Prefer longer phrases when trimming to the per-line budget. */
export function sortKeywordsByPhrasePriority(keywords: string[]): string[] {
  return [...keywords].sort((a, b) => {
    const aWords = a.trim().split(/\s+/).length;
    const bWords = b.trim().split(/\s+/).length;
    if (aWords !== bWords) {
      return bWords - aWords;
    }
    return b.length - a.length;
  });
}

/** Add topic phrases and known learnable phrases when the model missed them. */
export function boostKeywordsLocally(
  text: string,
  keywords: string[],
  topicTerms: string[],
): string[] {
  if (isPureSocialLine(text)) {
    return [];
  }

  const { phrases: topicPhrases, singles: topicSingles } = partitionTopicTerms(topicTerms);
  const result = [...keywords];
  // Only topic terms and known learnable phrases — skip arbitrary collocations and
  // single content words that often fail the semantic-coherence test.
  const candidates = [...topicPhrases, ...findLearnablePhrasesInText(text), ...topicSingles];

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

  return sortKeywordsByPhrasePriority(pruneSubsumedSingleWords(dedupeKeywords(result))).slice(
    0,
    MAX_KEYWORDS_PER_LINE,
  );
}

export function findLearnablePhrasesInText(text: string): string[] {
  const lower = text.toLowerCase();
  return LEARNABLE_PHRASES.filter((phrase) => {
    const pattern = buildKeywordRegex(phrase);
    return pattern.test(lower);
  }).sort((a, b) => b.length - a.length);
}

/** Reserve slots for branding phrases first, then fill remaining budget. */
export function applyAlwaysHighlightPhrases(
  text: string,
  keywords: string[],
  alwaysHighlightPhrases: string[],
): string[] {
  const always: string[] = [];

  for (const phrase of alwaysHighlightPhrases) {
    if (keywordAppearsInText(text, phrase)) {
      always.push(phrase);
    }
  }

  if (always.length === 0) {
    return sortKeywordsByPhrasePriority(pruneSubsumedSingleWords(dedupeKeywords(keywords))).slice(
      0,
      MAX_KEYWORDS_PER_LINE,
    );
  }

  const alwaysLower = new Set(always.map((phrase) => phrase.toLowerCase()));
  const rest = sortKeywordsByPhrasePriority(
    pruneSubsumedSingleWords(dedupeKeywords(keywords)),
  ).filter((keyword) => !alwaysLower.has(keyword.toLowerCase()));
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
