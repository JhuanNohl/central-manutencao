import nodemailer from 'nodemailer';
import type { Env } from '../config/env.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

export function createSmtpTransport(env: Env): MailTransport {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return {
    async send(message) {
      await transporter.sendMail({ from: env.MAIL_FROM, ...message });
    },
  };
}
