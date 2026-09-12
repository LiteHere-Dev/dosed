import nodemailer from "nodemailer";
import { env } from "../env";

const smtpConfigured = !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

const transport = smtpConfigured
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : null;

/**
 * Sends an email if SMTP_HOST/SMTP_USER/SMTP_PASS are configured; otherwise
 * logs it to stdout. This means verification/reset emails silently "work"
 * (as console output) in dev and in a prod deploy that hasn't configured
 * a mail provider yet — the flow is fully wired end-to-end either way, it
 * just won't reach a real inbox until you point it at Resend/SES/Postmark/
 * Mailgun/etc (any of them work over plain SMTP, see README).
 */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!transport) {
    console.log(`[mailer: no SMTP configured — logging instead]\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, to, subject, text });
}
