export interface RemindConfig {
  emailTo: string;
  emailFrom: string;
  resendApiKey: string;
  timezone: string;
  channelId: string;
  projectRoot: string;
}

export function loadRemindConfig(projectRoot = process.cwd()): RemindConfig {
  const emailTo = process.env.REMINDER_EMAIL_TO?.trim();
  const resendApiKey = process.env.RESEND_API_KEY?.trim();

  if (!emailTo) {
    throw new Error('REMINDER_EMAIL_TO is required');
  }
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY is required — get one at https://resend.com');
  }

  return {
    emailTo,
    emailFrom: process.env.REMINDER_EMAIL_FROM?.trim() || 'SEWE Reminder <onboarding@resend.dev>',
    resendApiKey,
    timezone: process.env.REMINDER_TIMEZONE?.trim() || 'Asia/Ho_Chi_Minh',
    channelId: process.env.REMINDER_CHANNEL_ID?.trim() || 'speak-english-with-energy',
    projectRoot,
  };
}
