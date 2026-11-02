/**
 * Sends transactional email through EmailJS's REST API.
 * The invitation layout lives in the EmailJS dashboard; templates/emailjs-invitation.html is its source.
 */

const EMAILJS_SEND_URL = "https://api.emailjs.com/api/v1.0/email/send";

export interface InvitationEmailOptions {
  recipientEmail: string;
  inviterName: string;
  inviterEmail: string;
  organizationName: string;
  roleName: string;
  acceptUrl: string;
  declineUrl: string;
  expiresInDays: number;
  expiresAtFormatted: string;
  appBaseUrl: string;
}

export interface SendEmailResult {
  success: boolean;
  deliveredVia: "emailjs" | "simulation" | "failed";
  error?: string;
}

export function getEmailJsConfig() {
  const serviceId = process.env["EMAILJS_SERVICE_ID"];
  const templateId = process.env["EMAILJS_TEMPLATE_ID"];
  const publicKey = process.env["EMAILJS_PUBLIC_KEY"];
  if (!serviceId || !templateId || !publicKey) return null;
  return { serviceId, templateId, publicKey, privateKey: process.env["EMAILJS_PRIVATE_KEY"] };
}

/** Every variable used by templates/emailjs-invitation.html and the template's Subject and To fields. */
export function invitationTemplateParams(opts: InvitationEmailOptions) {
  const appUrl = opts.appBaseUrl.replace(/\/+$/, "");
  return {
    subject: `You've been invited to join ${opts.organizationName} on FireOTA`,
    to_email: opts.recipientEmail,
    reply_to: opts.inviterEmail,
    inviter_name: opts.inviterName || opts.inviterEmail,
    inviter_email: opts.inviterEmail,
    organization_name: opts.organizationName,
    role_name: opts.roleName,
    accept_url: opts.acceptUrl,
    decline_url: opts.declineUrl,
    expires_in_days: String(opts.expiresInDays),
    expires_at: opts.expiresAtFormatted,
    logo_url: `${appUrl}/logo-mark-96.png`,
    app_url: appUrl,
  };
}

export async function sendInvitationEmail(opts: InvitationEmailOptions): Promise<SendEmailResult> {
  const config = getEmailJsConfig();

  if (!config) {
    // The link is a credential, so it is never written to the logs.
    console.info(`[Mailer:Simulated] EmailJS not configured. Invitation email not sent to ${opts.recipientEmail}.`);
    return { success: true, deliveredVia: "simulation" };
  }

  try {
    const response = await fetch(EMAILJS_SEND_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        service_id: config.serviceId,
        template_id: config.templateId,
        user_id: config.publicKey,
        ...(config.privateKey ? { accessToken: config.privateKey } : {}),
        template_params: invitationTemplateParams(opts),
      }),
      // A slow email service must not hang the invite request.
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`EmailJS responded ${response.status}: ${detail}`);
    }

    console.info(`[Mailer:EmailJS] Invitation sent to ${opts.recipientEmail}.`);
    return { success: true, deliveredVia: "emailjs" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[Mailer:Error] Failed to send email via EmailJS: ${message}`);
    return { success: false, deliveredVia: "failed", error: message };
  }
}
