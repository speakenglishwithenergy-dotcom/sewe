/** ASS BGR colours for burned-in subtitles (libass / FFmpeg subtitles filter). */

/** English dialogue — white. */
export const SUBTITLE_PRIMARY_COLOUR = '&H00FFFFFF';

/** IPA transcription — brand cyan (#2ba6e1), matches podcast waveform overlay. */
export const SUBTITLE_IPA_COLOUR = '&H00E1A62B';

/** Semi-transparent black box behind short-form subtitles (ASS &HAABBGGRR). */
export const SUBTITLE_SHORT_BACK_COLOUR = '&H80000000';

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

/** Short-form style: white text on a semi-transparent black background box. */
export function buildShortSubtitleForceStyle(fontSize: number, marginV: number): string {
  // Simpler and cleaner subtitle style: white text with subtle black outline, strong shadow, slightly opaque dark background.
  // Modern, readable, less intrusive.
  return [
    `Fontsize=${fontSize}`,
    // White text (BGR: &H00FFFFFF, no alpha)
    'PrimaryColour=&H00FFFFFF',
    // Black outline for legibility
    'OutlineColour=&H00000000',
    // Nearly opaque, dark (black) background for clear contrast. A=EE ≈ 93% opaque
    'BackColour=&HEE000000',
    // Simple border, box style with slight rounding if supported
    'BorderStyle=3',
    // Subtle outline to make text pop
    'Outline=2',
    // Strong shadow for readability on any background
    'Shadow=3',
    // Centered
    'Alignment=2',
    `MarginV=${marginV}`,
  ].join('\\,');
}

/** Wrap IPA lines with an ASS colour override for libass-rendered SRT. */
export function formatIpaSubtitleText(ipa: string): string {
  return `{\\c${SUBTITLE_IPA_COLOUR}&}${ipa}`;
}
