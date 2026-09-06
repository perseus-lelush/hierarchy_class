import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Database } from "@/types/supabase";
import { sendEmail } from "@/lib/email";
import { createServiceClient } from "@/lib/supabase/serviceClient";

// Feedback / report endpoint.
//
// Requires a signed-in user: the browser sends { feedback, page,
// attachmentPaths }, and everything else - who the user is, their email,
// role, and school - is looked up server-side from the session, so no
// credentials or personal data logic ever lives in client code. Anonymous
// submissions are rejected, which also makes the email path impossible to
// bomb without an account.
//
// Delivery is EMAIL-ONLY to the developer's own inbox (FEEDBACK_INBOX env
// var) - reports are NOT stored in the database and do not appear in any
// admin panel. A signed-in session is still required so the report is always
// attributed and the email path cannot be bombed anonymously.
//
// Attachments: the client uploads files to the private "feedback" storage
// bucket first (paths {school_id}/{user_id}/{uuid}.ext, enforced by storage
// RLS), then sends the resulting paths here. The route re-validates that
// every path belongs to the caller's own school/user folder, signs the
// objects with the server-only client, and emails the developer with working
// links.
//
// Email is sent through Resend's REST API (no SDK needed). Configure:
//   RESEND_API_KEY=re_...          (from https://resend.com/api-keys)
//   FEEDBACK_INBOX=you@example.com (delivery address for feedback emails)
//   FEEDBACK_FROM_EMAIL=Hierarchy Class <noreply@yourdomain.com>
//                                  (optional; defaults to Resend's sandbox)

// The feedback inbox comes from the environment - never hardcoded, so the
// repo carries no personal email addresses. Without it the route fails with
// 503 and the report is NOT delivered or stored anywhere - set it in every
// environment where feedback should work.
const feedbackInbox = process.env.FEEDBACK_INBOX?.trim() ?? "";
if (!feedbackInbox) {
  console.error("[feedback] FEEDBACK_INBOX is not set - feedback cannot be delivered.");
}

const MAX_ATTACHMENTS = 3;

function isOwnAttachmentPath(path: string, schoolId: string, userId: string): boolean {
  if (!path || path.length > 300) return false;
  // Path must be exactly {school_id}/{user_id}/{name} - no traversal, no
  // other folders, no query strings.
  const parts = path.split("/");
  if (parts.length !== 3) return false;
  if (parts[0] !== schoolId || parts[1] !== userId) return false;
  if (!parts[2] || parts[2].includes("..")) return false;
  return /^[a-zA-Z0-9_.-]+$/.test(parts[2]);
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, error: "Feedback isn't available right now." },
      { status: 503 }
    );
  }

  let body: { feedback?: unknown; page?: unknown; attachmentPaths?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // malformed body handled below
  }

  const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";
  if (!feedback) {
    return NextResponse.json({ ok: false, error: "Feedback text is required." }, { status: 400 });
  }
  if (feedback.length > 5000) {
    return NextResponse.json({ ok: false, error: "Feedback is too long (5,000 character limit)." }, { status: 400 });
  }

  // page and attachmentPaths must be the right types before any slicing -
  // a number/object here used to throw an unhandled TypeError.
  const page = typeof body.page === "string" ? body.page.slice(0, 300) : null;
  const rawAttachmentPaths = Array.isArray(body.attachmentPaths)
    ? body.attachmentPaths.filter((p): p is string => typeof p === "string")
    : [];
  const attachmentPaths = rawAttachmentPaths.slice(0, MAX_ATTACHMENTS);

  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: async () => {
        return cookieStore.getAll().map((cookie) => ({ name: cookie.name, value: cookie.value }));
      },
      setAll: async () => {
        // Read-only handler for this endpoint; nothing is set.
      },
    },
  });

  // Feedback requires a signed-in user - the report is always attributed.
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Please sign in to send feedback." },
      { status: 401 }
    );
  }

  const email = user.email ?? null;

  const { data: profile } = (await supabase
    .from("profiles")
    .select("id, full_name, role, school_id")
    .eq("user_id", user.id)
    .maybeSingle()) as unknown as {
    data: { id: string; full_name: string; role: string; school_id: string } | null;
    error: Error | null;
  };

  // A session without a profile row is a broken/partial account - no school
  // to attach, no storage folder to validate against.
  if (!profile) {
    return NextResponse.json(
      { ok: false, error: "Your account isn't fully set up yet, so feedback can't be sent." },
      { status: 403 }
    );
  }

  const fullName: string = profile.full_name || "Unknown user";
  const role: string = profile.role;
  const schoolId: string = profile.school_id;
  const profileId: string = profile.id;

  // Every attachment path must sit in the caller's own school/user folder -
  // a forged path can never point at another user's files.
  const verifiedPaths = attachmentPaths.filter((p) => isOwnAttachmentPath(p, schoolId, profileId));

  const { data: school } = (await supabase
    .from("schools")
    .select("name")
    .eq("id", schoolId)
    .maybeSingle()) as unknown as { data: { name: string } | null; error: Error | null };
  const schoolName = school?.name ?? null;

  // Sign attachment URLs with the server-only client (the reporter cannot
  // read objects back through the anon key). Links go ONLY into the email.
  const signedLinks: string[] = [];
  const svc = createServiceClient();
  if (svc && verifiedPaths.length > 0) {
    const { data } = await svc.storage.from("feedback").createSignedUrls(verifiedPaths, 60 * 60 * 24);
    ((data ?? []) as { signedUrl: string | null }[]).forEach((s) => {
      if (s?.signedUrl) signedLinks.push(s.signedUrl);
    });
  }

  const lines = [
    "Website: Hierarchy Class",
    `User: ${fullName}`,
    `Email: ${email ?? "not available"}`,
    `Role: ${role}`,
    schoolName ? `School: ${schoolName}` : "",
    page ? `Page: ${page}` : "",
    `Timestamp: ${new Date().toISOString()}`,
    "",
    "Feedback / report:",
    feedback,
    "",
    signedLinks.length > 0 ? "Attachments (signed links, expire in 24h):" : "",
    ...signedLinks.map((l) => `  - ${l}`),
    verifiedPaths.length > signedLinks.length
      ? `Note: ${verifiedPaths.length - signedLinks.length} attachment(s) could not be signed (storage or config issue).`
      : "",
  ].filter(Boolean).join("\n");

  // Email-only delivery: the report is not stored in any table. A missing
  // inbox or a provider failure is a hard error so the user knows their
  // feedback did NOT reach anyone.
  if (!feedbackInbox) {
    return NextResponse.json(
      { ok: false, error: "Feedback is temporarily unavailable - please try again later." },
      { status: 503 }
    );
  }

  const result = await sendEmail({
    to: feedbackInbox,
    subject: `Hierarchy Class feedback from ${fullName} (${role})`,
    text: lines,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "Couldn't send the feedback email. Please try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
