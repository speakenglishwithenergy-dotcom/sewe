/** ASS BGR colours for burned-in subtitles (libass / FFmpeg subtitles filter). */

/** English dialogue — white. */
export const SUBTITLE_PRIMARY_COLOUR = '&H00FFFFFF';

/** IPA transcription — brand cyan (#2ba6e1), matches podcast waveform overlay. */
export const SUBTITLE_IPA_COLOUR = '&H00E1A62B';

/** Build FFmpeg `force_style` for the subtitles filter (commas escaped for filtergraph). */
export function buildSubtitleForceStyle(fontSize: number, marginV: number): string {
  return [
    `Fontsize=${fontSize}`,
    `PrimaryColour=${SUBTITLE_PRIMARY_COLOUR}`,
    'OutlineColour=&H00000000',
    'BorderStyle=1',
    'Outline=1',
    'Shadow=1',
    'Alignment=2',
    `MarginV=${marginV}`,
  ].join('\\,');
}

/** Wrap IPA lines with an ASS colour override for libass-rendered SRT. */
export function formatIpaSubtitleText(ipa: string): string {
  return `{\\c${SUBTITLE_IPA_COLOUR}&}${ipa}`;
}
