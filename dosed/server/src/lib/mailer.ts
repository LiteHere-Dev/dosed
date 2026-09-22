import nodemailer from "nodemailer";
import { env } from "../env";

const smtpConfigured = !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
const resendConfigured = !!env.RESEND_API_KEY;

const transport = smtpConfigured
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : null;

export interface MailAttachment {
  filename: string;
  /** base64-encoded content */
  contentBase64: string;
  contentType: string;
}

/**
 * Sends an email if RESEND_API_KEY or SMTP_HOST/USER/PASS are configured
 * (Resend wins if both are set); otherwise logs to stdout. This means every
 * email-sending flow (verification, reset, refill alerts, vet summaries) is
 * fully wired end-to-end even before a provider is configured — it just
 * won't reach a real inbox until one is.
 */
export async function sendMail(to: string, subject: string, text: string, attachments?: MailAttachment[]): Promise<void> {
  if (resendConfigured) return sendViaResend(to, subject, text, attachments);
  if (transport) {
    await transport.sendMail({
      from: env.MAIL_FROM,
      to,
      subject,
      text,
      attachments: attachments?.map((a) => ({ filename: a.filename, content: a.contentBase64, encoding: "base64", contentType: a.contentType })),
    });
    return;
  }
  console.log(
    `[mailer: no provider configured — logging instead]\nTo: ${to}\nSubject: ${subject}\n\n${text}\n` +
      (attachments?.length ? `(+ ${attachments.length} attachment(s): ${attachments.map((a) => a.filename).join(", ")})\n` : "")
  );
}

// Resend's API takes a "from" string, plain fields, and base64 attachment
// content directly (no MIME assembly needed) — a single fetch call, no SDK
// dependency required for something this small.
async function sendViaResend(to: string, subject: string, text: string, attachments?: MailAttachment[]): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [to],
      subject,
      text,
      attachments: attachments?.map((a) => ({ filename: a.filename, content: a.contentBase64 })),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed: ${res.status} ${body.slice(0, 300)}`);
  }
}
