import axios from "axios";
import { getAccessToken } from "./msTokenManager.js";

/**
 * Microsoft Graph Mail Sender
 *
 * Sends emails through the Microsoft Graph API v1.0 using a delegated
 * user token (obtained via the refresh-token flow in msTokenManager).
 *
 * Usage:
 *   import { sendMailGraph } from "./utils/msMailSender.js";
 *   await sendMailGraph({ to: "user@ms.bulsu.edu.ph", subject: "Hello", html: "<p>Hi</p>" });
 */

// ─── Types ──────────────────────────────────────────────────────────────────────
interface SendMailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────────
const GRAPH_SEND_MAIL_URL = "https://graph.microsoft.com/v1.0/me/sendMail";
const MAX_RETRIES = 1; // retry once on 401 (token might have just expired)

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Send an email via Microsoft Graph API.
 *
 * @param to      - Recipient email address
 * @param subject - Email subject line
 * @param html    - HTML body (preferred)
 * @param text    - Plain-text body (fallback)
 * @returns true on success
 * @throws Error with details on failure
 */
export async function sendMailGraph({
  to,
  subject,
  html,
  text,
}: SendMailOptions): Promise<boolean> {
  const mailData = {
    message: {
      subject: subject || "BulSU Space Email",
      body: {
        contentType: html ? "HTML" : "Text",
        content: html || text || "",
      },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: "false",
  };

  let lastError: any;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const accessToken = await getAccessToken();

      await axios.post(GRAPH_SEND_MAIL_URL, mailData, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 30_000, // 30 s network timeout
      });

      console.log(`📧 Email sent to ${to} via Microsoft Graph`);
      return true;
    } catch (error: any) {
      lastError = error;
      const status = error?.response?.status;

      // If 401 Unauthorized, the token may be stale — clear cache and retry
      if (status === 401 && attempt < MAX_RETRIES) {
        const { clearTokenCache } = await import("./msTokenManager.js");
        clearTokenCache();
        console.warn(`⚠️ Graph 401 — retrying with fresh token (attempt ${attempt + 1})`);
        continue;
      }

      break; // non-retryable error
    }
  }

  const detail =
    lastError?.response?.data?.error?.message ||
    lastError?.response?.data?.error ||
    lastError?.message ||
    "Unknown error";

  console.error(`❌ Failed to send mail to ${to} via Microsoft Graph:`, detail);
  throw new Error(`Failed to send mail via Microsoft Graph: ${detail}`);
}
