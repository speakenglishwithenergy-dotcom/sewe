export function buildScriptPrompt(topic: string, test = false): string {
  if (test) {
    return `You are a professional podcast script writer.

Write a very short podcast script (TEST MODE) on this topic: "${topic}"

Hosts: Victor (male) and Lisa (female).

Requirements:
- Exactly 12 dialogue lines total
- English level: A2-B1
- Natural conversation, short sentences
- Include an "ipa" field for every line: General American English IPA in slashes

Return ONLY a valid JSON object:
{
  "title": "Episode title",
  "description": "Short description.",
  "thumbnailText": "THUMBNAIL TEXT",
  "script": [
    { "speaker": "Victor", "text": "...", "ipa": "/.../" },
    { "speaker": "Lisa", "text": "...", "ipa": "/.../" }
  ]
}`;
  }

  return `You are a professional podcast script writer for the YouTube channel "Speak English With Energy".

The podcast features two hosts:
- Victor: male, warm, enthusiastic, uses real-life examples, encouraging
- Lisa: female, thoughtful, asks insightful questions, relatable, practical

Write a complete podcast script on this topic: "${topic}"

REQUIREMENTS:
- English level: A2-B1 (clear vocabulary, common expressions, short sentences)
- Length: 20–25 minutes of spoken content (approximately 4,500–5,500 words total across ALL lines in the script array)
- Style: natural conversation, self-improvement focus, sounds human not AI-generated
- Only Victor and Lisa speak — no other characters, no narrator
- Open with one host greeting the audience and introducing the topic
- Close with a recap, an actionable tip, and a call to subscribe
- Use natural filler words: "well", "you know", "actually", "I mean", "right"
- Include short personal anecdotes and relatable everyday examples
- Keep turns short: 2–4 sentences per speaker turn (allows natural back-and-forth)
- Minimum 90 dialogue lines in the script array — do NOT stop early, write ALL lines
- IMPORTANT: You MUST write at least 90 complete dialogue lines before the script ends
- Include an "ipa" field for every dialogue line: General American English IPA wrapped in slashes (e.g. "/həˈloʊ ˈɛvriwʌn/"), matching natural spoken pronunciation

Return ONLY a valid JSON object with this exact structure (no markdown, no code blocks):
{
  "title": "Episode title — catchy, YouTube-friendly, max 70 characters",
  "description": "YouTube video description with SEO keywords, 3 paragraphs, encourage subscribe",
  "thumbnailText": "Thumbnail text — 5–6 bold words, impactful, uppercase friendly",
  "script": [
    { "speaker": "Victor", "text": "...", "ipa": "/.../" },
    { "speaker": "Lisa", "text": "...", "ipa": "/.../" }
  ]
}`;
}
