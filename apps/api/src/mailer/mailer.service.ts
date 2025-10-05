import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly log = new Logger('Mailer');
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
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
    }
  }

  async send(to: string, subject: string, html: string) {
    if (!this.transporter) {
      this.log.log(`[DEV MAIL] to=${to} subject="${subject}"\n${html}`);
      return;
    }
    await this.transporter.sendMail({
      from: process.env.FROM_EMAIL || 'no-reply@example.com',
      to, subject, html,
    });
  }

  async sendMagic(email: string, url: string) {
    return this.send(email, 'Magic Link', `<p>Tap to sign in: <a href="${url}">${url}</a></p>`);
  }
}
