/**
 * (production) or logs to console (local development).
 */

import { log } from "../utils/logger";

interface EmailBinding {
  send(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ messageId?: string }>;
}

type EmailEnv = {
  EMAIL?: EmailBinding;
};

export interface EmailResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

export interface EmailConfig {
  fromAddress: string;
  fromName: string;
}

/**
 * Send a password reset email
 *
 * In production (Cloudflare), uses Email Routing.
 * In development, logs the reset URL to console.
 *
 * @param email - Recipient email address
 * @param resetUrl - Full URL to password reset page with token
 * @param username - User's username (for personalization)
 * @param env - Environment bindings (for Cloudflare Email)
 * @returns Send result
 */
export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string,
  username: string,
  env?: EmailEnv,
): Promise<EmailResult> {
  const isDev =
    typeof process !== "undefined" && process.env?.NODE_ENV === "development";
  const hasEmailBinding = env?.EMAIL;

  // Development mode: log to console
  if (isDev || !hasEmailBinding) {
    console.log("\n" + "=".repeat(60));
    console.log("📧 PASSWORD RESET EMAIL (Development Mode)");
    console.log("=".repeat(60));
    console.log(`To: ${email}`);
    console.log(`Username: ${username}`);
    console.log(`Reset URL: ${resetUrl}`);
    console.log("=".repeat(60) + "\n");

    return {
      success: true,
      messageId: `dev-${Date.now()}`,
    };
  }

  // Production mode: send via Cloudflare Email Routing
  try {
    const emailContent = buildPasswordResetEmail(email, resetUrl, username);

    // Note: This requires EMAIL binding in wrangler.toml and email routing configured
    const emailBinding = env.EMAIL!;
    await emailBinding.send({
      to: email,
      from: getEmailConfig().fromAddress,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    return {
      success: true,
      messageId: `cf-${Date.now()}`,
    };
  } catch (error) {
    log("error", "Failed to send password reset email", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    };
  }
}

function buildPasswordResetEmail(
  email: string,
  resetUrl: string,
  username: string,
): { subject: string; html: string; text: string } {
  const subject = "Reset Your Aria Password";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      text-align: center;
      padding: 20px 0;
      border-bottom: 1px solid #eee;
    }
    .content {
      padding: 30px 0;
    }
    .button {
      display: inline-block;
      background: #0066ff;
      color: white !important;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-weight: 500;
      margin: 20px 0;
    }
    .button:hover {
      background: #0052cc;
    }
    .footer {
      padding-top: 20px;
      border-top: 1px solid #eee;
      font-size: 12px;
      color: #666;
    }
    .code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: monospace;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0; color: #0066ff;">Aria</h1>
  </div>

  <div class="content">
    <p>Hi <strong>${escapeHtml(username)}</strong>,</p>

    <p>We received a request to reset the password for your Aria account associated with <span class="code">${escapeHtml(email)}</span>.</p>

    <p>Click the button below to reset your password:</p>

    <p style="text-align: center;">
      <a href="${escapeHtml(resetUrl)}" class="button">Reset Password</a>
    </p>

    <p>This link will expire in <strong>1 hour</strong>.</p>

    <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>

    <p style="font-size: 13px; color: #666;">
      If the button doesn't work, copy and paste this URL into your browser:<br>
      <span style="word-break: break-all;">${escapeHtml(resetUrl)}</span>
    </p>
  </div>

  <div class="footer">
    <p>This email was sent by Aria. If you have questions, please contact your administrator.</p>
    <p>For security, this link expires in 1 hour and can only be used once.</p>
  </div>
</body>
</html>
`;

  const text = `
Reset Your Aria Password

Hi ${username},

We received a request to reset the password for your Aria account associated with ${email}.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

---
This email was sent by Aria. If you have questions, please contact your administrator.
For security, this link expires in 1 hour and can only be used once.
`;

  return { subject, html, text: text.trim() };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getEmailConfig(): EmailConfig {
  return {
    fromAddress: "noreply@aria.local",
    fromName: "Aria",
  };
}

/**
 * Build password reset URL
 *
 * @param baseUrl - Base URL of the Aria instance (e.g., https://example.com)
 * @param token - Reset token (unhashed)
 * @returns Full reset URL
 */
export function buildResetUrl(baseUrl: string, token: string): string {
  const url = new URL("/admin/reset-password", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}
