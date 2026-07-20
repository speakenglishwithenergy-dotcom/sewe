import { RemindConfig } from './remind.config';
import { RemindEmailContent } from './remind-content';

interface ResendEmailResponse {
  id?: string;
  message?: string;
}

export class RemindEmailService {
  constructor(private readonly config: RemindConfig) {}

  async send(content: RemindEmailContent): Promise<string> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.emailFrom,
        to: [this.config.emailTo],
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
    });

    const body = await response.json() as ResendEmailResponse;
    if (!response.ok) {
      throw new Error(body.message ?? `Resend API error (${response.status})`);
    }

    if (!body.id) {
      throw new Error('Resend API did not return an email id');
    }

    return body.id;
  }
}
