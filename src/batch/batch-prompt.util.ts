import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import {
  BatchScheduleSlot,
  formatBatchScheduleSlot,
  formatViWeekdayHelp,
  isScheduleDateValid,
  parseScheduleDateInput,
} from '../social/schedule.util';
import { BatchCount } from './batch.types';

function createInterface(): readline.Interface {
  return readline.createInterface({ input, output });
}

async function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  const answer = await rl.question(question);
  return answer.trim();
}

function formatIndexRange(count: BatchCount): string {
  return count === 2 ? '1-2' : '1-3';
}

export async function askBatchCountInteractive(): Promise<BatchCount> {
  const rl = createInterface();

  try {
    while (true) {
      console.log('\nHow many episodes this batch?');
      console.log('  [2] two episodes');
      console.log('  [3] three episodes (default)');
      const answer = (await askQuestion(rl, '> ')).toLowerCase();

      if (!answer || answer === '3' || answer === 'three') return 3;
      if (answer === '2' || answer === 'two') return 2;

      console.log('Invalid input. Enter 2 or 3.');
    }
  } finally {
    rl.close();
  }
}

export function printSuggestedTopics(topics: string[]): void {
  console.log('\nSuggested topics:');
  topics.forEach((topic, index) => {
    console.log(`  ${index + 1}. ${topic}`);
  });
  console.log(`\nActions: [${formatIndexRange(topics.length as BatchCount)}] edit topic | [r] regenerate | [y] confirm | [q] quit`);
}

export function printScheduleSlots(slots: BatchScheduleSlot[], timezone: string): void {
  console.log('\nPublish schedule:');
  slots.forEach((slot, index) => {
    console.log(`  ${index + 1}. ${formatBatchScheduleSlot(slot, timezone)}`);
  });
  console.log(`\nActions: [${formatIndexRange(slots.length as BatchCount)}] change date (2-8 or YYYY-MM-DD) | [d] reset defaults | [y] confirm | [q] quit`);
  console.log(`Weekdays: ${formatViWeekdayHelp()}`);
}

export async function reviewScheduleInteractive(
  defaultSlots: BatchScheduleSlot[],
  timezone: string,
): Promise<BatchScheduleSlot[] | null> {
  const rl = createInterface();
  const count = defaultSlots.length as BatchCount;
  let slots = [...defaultSlots];

  try {
    while (true) {
      printScheduleSlots(slots, timezone);
      const action = (await askQuestion(rl, '> ')).toLowerCase();

      if (action === 'y' || action === 'yes') {
        const unique = new Set(slots.map((slot) => slot.dateIso));
        if (unique.size !== count) {
          console.log(`All ${count} publish dates must be distinct.`);
          continue;
        }

        const invalid = slots.find((slot) => !isScheduleDateValid(slot.dateIso, timezone));
        if (invalid) {
          console.log(`Date must be today or later (${timezone}): ${invalid.dateIso}`);
          continue;
        }

        return slots;
      }

      if (action === 'q' || action === 'quit') {
        return null;
      }

      if (action === 'd' || action === 'default') {
        slots = [...defaultSlots];
        continue;
      }

      const index = Number.parseInt(action, 10);
      if (index >= 1 && index <= count) {
        const dateInput = await askQuestion(
          rl,
          `Publish day for topic ${index} (2-8 or YYYY-MM-DD): `,
        );
        const slot = parseScheduleDateInput(dateInput, timezone);
        if (!slot) {
          console.log(`Invalid date. Use weekday 2-8, e.g. 2=Thứ hai, 8=Chủ nhật, or YYYY-MM-DD.`);
          console.log(`Weekdays: ${formatViWeekdayHelp()}`);
          continue;
        }
        if (!isScheduleDateValid(slot.dateIso, timezone)) {
          console.log(`Date must be today or later (${timezone}).`);
          continue;
        }
        slots[index - 1] = slot;
        continue;
      }

      console.log(`Invalid input. Use ${formatIndexRange(count)}, d, y, or q.`);
    }
  } finally {
    rl.close();
  }
}

export async function reviewTopicsInteractive(
  initialTopics: string[],
  regenerate: () => Promise<string[]>,
): Promise<string[] | null> {
  const rl = createInterface();
  const count = initialTopics.length as BatchCount;
  let topics = [...initialTopics];

  try {
    while (true) {
      printSuggestedTopics(topics);
      const action = (await askQuestion(rl, '> ')).toLowerCase();

      if (action === 'y' || action === 'yes') {
        const unique = new Set(topics.map((topic) => topic.trim().toLowerCase()));
        if (unique.size !== count || topics.some((topic) => !topic.trim())) {
          console.log(`All ${count} topics must be non-empty and distinct. Edit before confirming.`);
          continue;
        }
        return topics;
      }

      if (action === 'q' || action === 'quit') {
        return null;
      }

      if (action === 'r' || action === 'regenerate') {
        topics = await regenerate();
        continue;
      }

      const index = Number.parseInt(action, 10);
      if (index >= 1 && index <= count) {
        const edited = await askQuestion(rl, `New text for topic ${index}: `);
        if (!edited) {
          console.log('Topic cannot be empty.');
          continue;
        }
        topics[index - 1] = edited;
        continue;
      }

      console.log(`Invalid input. Use ${formatIndexRange(count)}, r, y, or q.`);
    }
  } finally {
    rl.close();
  }
}
