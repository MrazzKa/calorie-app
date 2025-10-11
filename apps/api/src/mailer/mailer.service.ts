import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly log = new Logger('Mailer');
  private transporter: nodemailer.Transporter | null = null;
  private mode: 'smtp' | 'console' | 'noop' = 'noop';

  constructor() {
    const isProd = process.env.NODE_ENV === 'production';
    const disabled = process.env.MAIL_DISABLE === 'true';
    if (!isProd || disabled) {
      this.mode = disabled ? 'noop' : 'console';
      this.transporter = null;
      this.log.log(`Mailer transport: ${this.mode}`);
      return;
    }
    if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      this.mode = 'smtp';
      this.log.log(`Mailer transport: ${this.mode}`);
    } else {
      this.mode = 'noop';
      this.transporter = null;
      this.log.log(`Mailer transport: ${this.mode}`);
    }
  }

  async send(to: string, subject: string, html: string) {
    try {
      if (!this.transporter) {
        if (this.mode === 'console') this.log.log(`[MAIL] to=${to} subject="${subject}"`);
        return;
      }
      await this.transporter.sendMail({
        from: process.env.FROM_EMAIL || 'no-reply@example.com',
        to, subject, html,
      });
    } catch (e) {
      const isProd = process.env.NODE_ENV === 'production';
      if (isProd) throw e;
      this.log.warn(`send failed (non-prod): ${String((e as any)?.message || e)}`);
    }
  }

  async sendMagic(email: string, url: string) {
    return this.send(email, 'Magic Link', `<p>Tap to sign in: <a href="${url}">${url}</a></p>`);
  }
}
