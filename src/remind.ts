import 'dotenv/config';
import { buildRemindEmailContent } from './remind/remind-content';
import { loadRemindConfig } from './remind/remind.config';
import { RemindEmailService } from './remind/remind-email.service';
import {
  getTodayIso,
  isReminderDayInTimezone,
  RemindStateService,
} from './remind/remind-state.service';
import { logger } from './utils/logger';

type RemindCliArgs = {
  force: boolean;
  dryRun: boolean;
};

function parseRemindArgs(): RemindCliArgs {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage:');
    console.log('  npm run remind');
    console.log('  npm run remind -- --force');
    console.log('  npm run remind -- --dry-run');
    console.log('');
    console.log('Schedule: Tue/Thu/Sat/Sun 20:00 Asia/Ho_Chi_Minh (GitHub Actions).');
    console.log('  macOS : npm run remind:install');
    console.log('  GitHub: add secrets + enable .github/workflows/batch-reminder.yml');
    process.exit(0);
  }

  return {
    force: args.includes('--force'),
    dryRun: args.includes('--dry-run'),
  };
}

async function main(): Promise<void> {
  const args = parseRemindArgs();
  const config = loadRemindConfig();
  const state = new RemindStateService(config.projectRoot);
  const todayIso = getTodayIso(config.timezone);

  if (!args.force && !isReminderDayInTimezone(config.timezone)) {
    logger.info(
      `Today is not a reminder day (Tue/Thu/Sat/Sun) in ${config.timezone} — skipping (use --force to send anyway).`,
    );
    return;
  }

  const lastSentDate = await state.getLastSentDate();
  if (!args.force && lastSentDate === todayIso) {
    logger.info(`Reminder already sent today (${todayIso}) — skipping.`);
    return;
  }

  const content = await buildRemindEmailContent(config.projectRoot, config.channelId);

  if (args.dryRun) {
    logger.info('Dry run — email not sent.');
    console.log(`To   : ${config.emailTo}`);
    console.log(`From : ${config.emailFrom}`);
    console.log(`Subject: ${content.subject}`);
    console.log('\n--- TEXT ---\n');
    console.log(content.text);
    return;
  }

  const emailService = new RemindEmailService(config);
  const emailId = await emailService.send(content);
  await state.markSent(todayIso);

  logger.success(`Reminder sent to ${config.emailTo} (id: ${emailId})`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Fatal: ${message}`);
  process.exit(1);
});
