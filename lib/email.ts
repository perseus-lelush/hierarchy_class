// Server-only email helper (Resend REST API - no SDK needed).
//
// Used by the feedback route and the account-restriction server actions.
// Never import this from client code: it reads RESEND_API_KEY and friends
// from the server environment, and none of those values are NEXT_PUBLIC_*.
//
// Configure:
//   RESEND_API_KEY=re_...                    (https://resend.com/api-keys)
//   FEEDBACK_FROM_EMAIL=Hierarchy Class <noreply@yourdomain.com>
//                                            (optional; falls back to
//                                             Resend's onboarding sandbox)
// The feedback delivery address comes from the FEEDBACK_INBOX env var
// (see app/api/feedback/route.ts).

const DEFAULT_FROM = "Hierarchy Class <onboarding@resend.dev>";

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  /** Override the envelope From (defaults to FEEDBACK_FROM_EMAIL or the
   *  Resend onboarding sandbox). */
  from?: string;
}

export async function sendEmail({
  to,
  subject,
  text,
  from,
}: EmailOptions): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      "[email] RESEND_API_KEY not set - email not sent (subject: " + subject + ")."
    );
    return { ok: false, error: "Email isn't configured on this deployment." };
  }

  const fromAddress = from?.trim() ?? process.env.FEEDBACK_FROM_EMAIL?.trim() ?? DEFAULT_FROM;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromAddress, to: [to], subject, text }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[email] Resend error ${res.status}: ${detail}`);
      return { ok: false, error: `Email provider error (${res.status}).` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] Failed to send email", err);
    return { ok: false, error: "Failed to send email." };
  }
}
