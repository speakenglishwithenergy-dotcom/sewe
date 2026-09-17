import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isReminderDayInTimezone } from './remind-state.service';

const TZ = 'Asia/Ho_Chi_Minh';

/** 13:00 UTC = 20:00 Asia/Ho_Chi_Minh — the GitHub Actions cron time. */
function atCronTime(isoDate: string): Date {
  return new Date(`${isoDate}T13:00:00.000Z`);
}

describe('isReminderDayInTimezone', () => {
  it('sends on Tue, Thu, Sat, and Sun at the 20:00 VN cron slot', () => {
    assert.equal(isReminderDayInTimezone(TZ, atCronTime('2026-09-15')), true); // Tue
    assert.equal(isReminderDayInTimezone(TZ, atCronTime('2026-09-17')), true); // Thu
    assert.equal(isReminderDayInTimezone(TZ, atCronTime('2026-09-19')), true); // Sat
    assert.equal(isReminderDayInTimezone(TZ, atCronTime('2026-09-20')), true); // Sun
  });

  it('skips Mon, Wed, and Fri at the same slot', () => {
    assert.equal(isReminderDayInTimezone(TZ, atCronTime('2026-09-14')), false); // Mon
    assert.equal(isReminderDayInTimezone(TZ, atCronTime('2026-09-16')), false); // Wed
    assert.equal(isReminderDayInTimezone(TZ, atCronTime('2026-09-18')), false); // Fri
  });
});
