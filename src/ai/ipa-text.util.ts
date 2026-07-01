/** Strip markdown/emoji for IPA generation while keeping spoken words intact. */
export function prepareTextForIpa(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed === '---') {
    return null;
  }

  let speakable = trimmed.replace(/^#+\s*/, '');
  speakable = speakable.replace(/\*\*([^*]+)\*\*/g, '$1');
  speakable = speakable.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
  speakable = speakable.replace(/\s+/g, ' ').trim();

  return speakable || null;
}
