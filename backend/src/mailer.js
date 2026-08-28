import nodemailer from 'nodemailer';

export function buildTransport(settings) {
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: Number(settings.smtpPort) || 587,
    secure: Boolean(settings.smtpSecure),
    auth: settings.smtpUsername ? { user: settings.smtpUsername, pass: settings.smtpPassword } : undefined,
  });
}

export async function sendMail(settings, { to, subject, text, html, attachments }) {
  const transport = buildTransport(settings);
  const address = settings.smtpFromAddress || settings.smtpUsername;
  const from = settings.smtpFromName ? { name: settings.smtpFromName, address } : address;
  await transport.sendMail({ from, to, subject, text, html, attachments });
}
