import nodemailer, { type Transporter } from 'nodemailer';
import { config } from './config.js';

/**
 * Transactional email via Brevo SMTP relay (smtp-relay.brevo.com:587).
 * SMTP is used instead of the REST API because Brevo's API enforces an
 * IP allowlist that breaks on dynamic cloud egress IPs (e.g. Railway).
 * No-op when BREVO_API_KEY is unset so dev/tests never need it.
 * All sends are fire-and-forget: mail failure must never break a request.
 */

let transporter: Transporter | null = null;
function getTransporter(): Transporter | null {
  if (!config.mail.apiKey || !config.mail.smtpUser) return null;
  transporter ??= nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: { user: config.mail.smtpUser, pass: config.mail.apiKey },
  });
  return transporter;
}

interface SendInput {
  to: { email: string; name?: string };
  subject: string;
  html: string;
}

export function mailEnabled(): boolean {
  return !!config.mail.apiKey && !!config.mail.smtpUser;
}

export async function sendMail(input: SendInput): Promise<void> {
  const t = getTransporter();
  if (!t) return;
  try {
    await t.sendMail({
      from: `"${config.mail.fromName}" <${config.mail.from}>`,
      to: input.to.name ? `"${input.to.name}" <${input.to.email}>` : input.to.email,
      subject: input.subject,
      html: input.html,
    });
  } catch (err) {
    console.error('[mail] send failed:', err);
  }
}

/** Fire-and-forget wrapper — never awaited by request handlers. */
export function sendMailAsync(input: SendInput): void {
  void sendMail(input);
}

// ---------- Templates (inline HTML, brand: sunny/cream/ink) ----------

const shell = (title: string, body: string) => `<!doctype html>
<html><body style="margin:0;padding:0;background:#fff7e8;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px;">
    <div style="background:#1c1917;border-radius:16px 16px 0 0;padding:20px 28px;">
      <span style="color:#ffd23f;font-weight:800;font-size:20px;letter-spacing:-0.5px;">TeamKommit</span>
    </div>
    <div style="background:#fffdf7;border:2px solid #1c1917;border-top:none;border-radius:0 0 16px 16px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#1c1917;">${title}</h1>
      ${body}
    </div>
    <p style="text-align:center;color:#78716c;font-size:12px;margin-top:16px;">
      Race-proof teams. Deadline-proof submissions.
    </p>
  </div>
</body></html>`;

const cta = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#ffd23f;color:#1c1917;font-weight:800;padding:12px 24px;border-radius:12px;text-decoration:none;border:2px solid #1c1917;">${label}</a>`;

export function welcomeEmail(to: { email: string; name?: string }, displayName: string, verifyUrl: string): SendInput {
  return {
    to,
    subject: 'Welcome to TeamKommit — confirm your email',
    html: shell('Welcome aboard, ' + escapeHtml(displayName) + '!', `
      <p style="color:#44403c;line-height:1.6;">Your account is ready. Confirm your email to secure it, then find your crew for Hack4Hack 2026:</p>
      <ul style="color:#44403c;line-height:1.8;padding-left:20px;">
        <li>Browse the <strong>Board</strong> and join a team in one click</li>
        <li>Complete your profile for sharper teammate matches</li>
        <li>Submit before the deadline — we handle the rest</li>
      </ul>
      <p style="margin-top:24px;">${cta(verifyUrl, 'Confirm my email')}</p>
      <p style="color:#78716c;font-size:12px;margin-top:16px;">This link expires in 24h. If you didn\u2019t create this account, ignore this email.</p>
    `),
  };
}

export function verificationEmail(to: { email: string; name?: string }, verifyUrl: string): SendInput {
  return {
    to,
    subject: 'Confirm your TeamKommit email',
    html: shell('Confirm your email', `
      <p style="color:#44403c;line-height:1.6;">Click below to confirm this address belongs to you.</p>
      <p style="margin-top:24px;">${cta(verifyUrl, 'Confirm my email')}</p>
      <p style="color:#78716c;font-size:12px;margin-top:16px;">This link expires in 24h. If you didn\u2019t request it, ignore this email.</p>
    `),
  };
}

export function passwordResetEmail(to: { email: string; name?: string }, resetUrl: string): SendInput {
  return {
    to,
    subject: 'Reset your TeamKommit password',
    html: shell('Password reset', `
      <p style="color:#44403c;line-height:1.6;">We received a request to reset your password. This link is valid for 30 minutes and can be used once.</p>
      <p style="margin-top:24px;">${cta(resetUrl, 'Choose a new password')}</p>
      <p style="color:#78716c;font-size:12px;margin-top:16px;">If you didn\u2019t request this, ignore this email — your password stays unchanged.</p>
    `),
  };
}

export function teamInviteEmail(
  to: { email: string; name?: string },
  inviterName: string,
  teamName: string,
): SendInput {
  return {
    to,
    subject: `${inviterName} invited you to ${teamName}`,
    html: shell('You\u2019re invited!', `
      <p style="color:#44403c;line-height:1.6;"><strong>${escapeHtml(inviterName)}</strong> invited you to join
      <strong>${escapeHtml(teamName)}</strong> for Hack4Hack 2026.</p>
      <p style="color:#44403c;line-height:1.6;">Accept or decline from your invitations — spots are limited.</p>
      <p style="margin-top:24px;">${cta(config.mail.appUrl + '/board', 'View invitations')}</p>
    `),
  };
}

export function submissionStatusEmail(
  to: { email: string; name?: string },
  teamName: string,
  version: number,
  status: string,
  detail?: string,
): SendInput {
  const ok = status === 'ACCEPTED';
  const color = ok ? '#059669' : '#dc2626';
  return {
    to,
    subject: `Submission v${version} ${status.toLowerCase().replace('_', ' ')} — ${teamName}`,
    html: shell(`v${version}: ${status.replace('_', ' ')}`, `
      <p style="color:#44403c;line-height:1.6;">Your team <strong>${escapeHtml(teamName)}</strong> submission
      v${version} was checked and marked <strong style="color:${color};">${escapeHtml(status.replace('_', ' '))}</strong>.</p>
      ${detail ? `<p style="color:#78716c;font-size:14px;">${escapeHtml(detail)}</p>` : ''}
      <p style="margin-top:24px;">${cta(config.mail.appUrl + '/submissions', 'View submissions')}</p>
    `),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
