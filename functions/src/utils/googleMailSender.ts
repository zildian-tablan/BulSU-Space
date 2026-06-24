import nodemailer from "nodemailer";

/**
 * Gmail SMTP Mail Sender (via Nodemailer)
 *
 * Credentials are loaded from environment variables (set in .env.bulsuspace):
 *   GMAIL_USER          — sender Gmail address
 *   GMAIL_APP_PASSWORD  — Google App Password (not the account password)
 */

function getGmailConfig() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      "Missing Gmail environment variables. " +
      "Ensure GMAIL_USER and GMAIL_APP_PASSWORD are set in functions/.env.bulsuspace"
    );
  }

  return { user, pass };
}

/**
 * Send an email using Gmail SMTP via Nodemailer
 */
export async function sendMailNodemailer({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}): Promise<boolean> {
  try {
    const { user, pass } = getGmailConfig();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    const mailOptions = {
      from: `"BulSU Space" <${user}>`,
      to,
      subject: subject || "BulSU Space Email",
      text: text || "",
      html: html || undefined,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent to ${to}: ${info.messageId}`);

    return true;
  } catch (error: any) {
    console.error(`❌ Failed to send email to ${to} via Gmail:`, error.message);
    throw new Error("Failed to send email via Nodemailer: " + error.message);
  }
}
