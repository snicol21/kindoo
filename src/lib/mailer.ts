import nodemailer from 'nodemailer';

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 0);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !port || !from) {
    throw new Error(
      'SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER, SMTP_PASS.'
    );
  }

  return { host, port, user, pass, from };
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const { host, port, user, pass, from } = getSmtpConfig();

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });

  const subject = 'Reset your password';
  const text = `Reset your password using this link: ${resetUrl}`;
  const html = `<p>Reset your password using this link:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}
