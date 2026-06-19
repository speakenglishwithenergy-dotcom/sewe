/**
 * Compute the next UTC Date for a wall-clock time in a given IANA timezone.
 *
 * If the target time today (in the given timezone) is more than MIN_LEAD_MS
 * in the future, it is returned.  Otherwise the same wall-clock time on the
 * following calendar day is returned.
 */

const MIN_LEAD_MS = 5 * 60 * 1000; // 5-minute minimum lead time

/**
 * Returns the UTC Date for the next occurrence of `hhmm` in `timezone`.
 *
 * @param hhmm    Wall-clock time, e.g. "11:30" or "17:30"
 * @param timezone IANA timezone name, e.g. "Asia/Ho_Chi_Minh"
 */
export function nextScheduledTime(hhmm: string, timezone: string): Date {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const now = new Date();

  for (let daysAhead = 0; daysAhead <= 1; daysAhead++) {
    const candidate = wallClockToUtc(now, daysAhead, hours, minutes, timezone);
    if (candidate.getTime() > now.getTime() + MIN_LEAD_MS) {
      return candidate;
    }
  }

  // Fallback: 2 days ahead (should never be needed)
  return wallClockToUtc(now, 2, hours, minutes, timezone);
}

/**
 * Convert a wall-clock date+time in a specific timezone to a UTC Date.
 *
 * Strategy:
 *  1. Get today's date string in the target timezone (e.g. "2024-06-19").
 *  2. Advance by `daysAhead` calendar days.
 *  3. Construct a UTC instant for that date at 00:00:00.
 *  4. Ask Intl what local time that UTC instant maps to in the timezone.
 *  5. Compute the offset and subtract it to get the correct UTC instant.
 *
 * This handles DST correctly because we re-derive the offset at the actual
 * target date rather than reusing the current offset.
 */
function wallClockToUtc(
  base: Date,
  daysAhead: number,
  hours: number,
  minutes: number,
  timezone: string,
): Date {
  // Step 1: date string in the target timezone
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base); // "YYYY-MM-DD"

  // Step 2: advance by daysAhead
  const [year, month, day] = dateParts.split('-').map(Number);
  const targetMidnightUtc = new Date(Date.UTC(year, month - 1, day + daysAhead));

  // Step 3: build a probe Date — treat midnight UTC as if it were the target time,
  //         just to get a timezone offset estimate near the right date.
  const probeUtc = new Date(
    targetMidnightUtc.getTime() + (hours * 60 + minutes) * 60 * 1000,
  );

  // Step 4: find out what local time this UTC instant corresponds to in the timezone.
  const localParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(probeUtc);

  const get = (type: string) =>
    parseInt(localParts.find((p) => p.type === type)!.value, 10);

  const localAsUtc = new Date(
    Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')),
  );

  // Step 5: offset = localAsUtc − probeUtc; subtract to get correct UTC
  const offsetMs = localAsUtc.getTime() - probeUtc.getTime();
  return new Date(probeUtc.getTime() - offsetMs);
}
