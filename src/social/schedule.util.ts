/**
 * Compute the next UTC Date for a wall-clock time in a given IANA timezone.
 *
 * If the target time today (in the given timezone) is more than MIN_LEAD_MS
 * in the future, it is returned.  Otherwise the same wall-clock time on the
 * following calendar day is returned.
 */

const MIN_LEAD_MS = 5 * 60 * 1000; // 5-minute minimum lead time

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export type BatchWeekday = 'monday' | 'wednesday' | 'friday';

export type WeekdayName =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

const BATCH_WEEKDAYS: BatchWeekday[] = ['monday', 'wednesday', 'friday'];

/** JS getDay() values for Mon / Wed / Fri */
const BATCH_WEEKDAY_NUMBERS = [1, 3, 5] as const;

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

function getCalendarDateInTimezone(date: Date, timezone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);

  return { year: get('year'), month: get('month'), day: get('day') };
}

function getWeekdayInTimezone(date: Date, timezone: string): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(date);

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

function calendarDateToIso(date: CalendarDate): string {
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${date.year}-${month}-${day}`;
}

/** Calendar date + weekday for an instant in an IANA timezone. */
export function datePartsInTimezone(
  date: Date,
  timezone: string,
): { dateIso: string; weekday: WeekdayName } {
  const cal = getCalendarDateInTimezone(date, timezone);
  const dayNumber = getWeekdayInTimezone(date, timezone);
  return {
    dateIso: calendarDateToIso(cal),
    weekday: WEEKDAY_NAMES[dayNumber] ?? 'monday',
  };
}

function weekdayLabel(dayNumber: number): BatchWeekday {
  if (dayNumber === 1) return 'monday';
  if (dayNumber === 3) return 'wednesday';
  return 'friday';
}

const WEEKDAY_NAMES: WeekdayName[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export function weekdayNameFromDate(date: CalendarDate, timezone: string): WeekdayName {
  const dayNumber = getWeekdayInTimezone(
    new Date(Date.UTC(date.year, date.month - 1, date.day, 12)),
    timezone,
  );
  return WEEKDAY_NAMES[dayNumber] ?? 'monday';
}

export function parseCalendarDateIso(dateIso: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));

  if (
    probe.getUTCFullYear() !== year
    || probe.getUTCMonth() + 1 !== month
    || probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function buildScheduleSlotFromIso(dateIso: string, timezone: string): BatchScheduleSlot | null {
  const date = parseCalendarDateIso(dateIso);
  if (!date) return null;

  return {
    weekday: weekdayNameFromDate(date, timezone),
    date,
    dateIso: calendarDateToIso(date),
  };
}

export function isScheduleDateValid(
  dateIso: string,
  timezone: string,
  fromDate = new Date(),
): boolean {
  const slot = buildScheduleSlotFromIso(dateIso, timezone);
  if (!slot) return false;

  const today = getCalendarDateInTimezone(fromDate, timezone);
  return calendarDateToIso(slot.date) >= calendarDateToIso(today);
}

export type ViWeekdayNumber = 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Vietnamese weekday numbering: 2=Mon … 8=Sun */
export const VI_WEEKDAY_LABELS: Record<ViWeekdayNumber, string> = {
  2: 'Thứ hai',
  3: 'Thứ ba',
  4: 'Thứ tư',
  5: 'Thứ năm',
  6: 'Thứ sáu',
  7: 'Thứ bảy',
  8: 'Chủ nhật',
};

const VI_WEEKDAY_TO_JS: Record<ViWeekdayNumber, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 0,
};

export function formatViWeekdayHelp(): string {
  return Object.entries(VI_WEEKDAY_LABELS)
    .map(([num, label]) => `${num}=${label}`)
    .join(', ');
}

export function isViWeekdayNumber(value: number): value is ViWeekdayNumber {
  return value >= 2 && value <= 8;
}

function normalizeScheduleInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseViWeekdayNumberFromText(input: string): ViWeekdayNumber | null {
  const normalized = normalizeScheduleInput(input);

  const asNumber = Number.parseInt(normalized, 10);
  if (isViWeekdayNumber(asNumber)) return asNumber;

  const aliases: Record<string, ViWeekdayNumber> = {
    'thu 2': 2,
    thu2: 2,
    'thu hai': 2,
    'thu 3': 3,
    thu3: 3,
    'thu ba': 3,
    'thu 4': 4,
    thu4: 4,
    'thu tu': 4,
    'thu 5': 5,
    thu5: 5,
    'thu nam': 5,
    'thu 6': 6,
    thu6: 6,
    'thu sau': 6,
    'thu 7': 7,
    thu7: 7,
    'thu bay': 7,
    cn: 8,
    'chu nhat': 8,
  };

  return aliases[normalized] ?? null;
}

export function nextOccurrenceOfViWeekday(
  viWeekday: ViWeekdayNumber,
  timezone: string,
  fromDate = new Date(),
): CalendarDate | null {
  const targetJsDay = VI_WEEKDAY_TO_JS[viWeekday];
  let cursor = getCalendarDateInTimezone(fromDate, timezone);

  for (let guard = 0; guard < 8; guard++) {
    const jsDay = getWeekdayInTimezone(
      new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day, 12)),
      timezone,
    );

    if (jsDay === targetJsDay) {
      const dateIso = calendarDateToIso(cursor);
      if (isScheduleDateValid(dateIso, timezone, fromDate)) {
        return cursor;
      }
    }

    cursor = addCalendarDays(cursor, 1);
  }

  return null;
}

export function parseScheduleDateInput(
  input: string,
  timezone: string,
  fromDate = new Date(),
): BatchScheduleSlot | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const isoSlot = buildScheduleSlotFromIso(trimmed, timezone);
  if (isoSlot) return isoSlot;

  const viWeekday = parseViWeekdayNumberFromText(trimmed);
  if (!viWeekday) return null;

  const date = nextOccurrenceOfViWeekday(viWeekday, timezone, fromDate);
  if (!date) return null;

  return buildScheduleSlotFromIso(calendarDateToIso(date), timezone);
}

/**
 * Returns UTC Date for a wall-clock time on a specific calendar day in a timezone.
 */
export function scheduledTimeOnDate(
  hhmm: string,
  timezone: string,
  date: CalendarDate,
): Date {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const targetMidnightUtc = new Date(Date.UTC(date.year, date.month - 1, date.day));
  const probeUtc = new Date(
    targetMidnightUtc.getTime() + (hours * 60 + minutes) * 60 * 1000,
  );

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

  const offsetMs = localAsUtc.getTime() - probeUtc.getTime();
  return new Date(probeUtc.getTime() - offsetMs);
}

export interface BatchScheduleSlot {
  weekday: WeekdayName;
  date: CalendarDate;
  dateIso: string;
}

/**
 * Next Mon / Wed / Fri calendar dates starting from today in the given timezone.
 */
export function nextMonWedFriDates(
  fromDate: Date,
  timezone: string,
  count = 3,
): BatchScheduleSlot[] {
  const today = getCalendarDateInTimezone(fromDate, timezone);
  let cursor = today;
  const slots: BatchScheduleSlot[] = [];

  for (let guard = 0; guard < 21 && slots.length < count; guard++) {
    const weekday = getWeekdayInTimezone(
      new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day, 12)),
      timezone,
    );

    if (BATCH_WEEKDAY_NUMBERS.includes(weekday as 1 | 3 | 5)) {
      slots.push({
        weekday: weekdayNameFromDate(cursor, timezone),
        date: cursor,
        dateIso: calendarDateToIso(cursor),
      });
    }

    cursor = addCalendarDays(cursor, 1);
  }

  if (slots.length < count) {
    throw new Error(`Could not resolve the next ${count} Mon/Wed/Fri dates`);
  }

  return slots;
}

export function formatBatchScheduleSlot(slot: BatchScheduleSlot, timezone: string): string {
  const label = slot.weekday.charAt(0).toUpperCase() + slot.weekday.slice(1);
  return `${label} ${slot.dateIso} (${timezone})`;
}

export { BATCH_WEEKDAYS };
