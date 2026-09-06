import { NextResponse } from "next/server";
import { resendSignupConfirmation } from "@/lib/server/authOps";
import { enforceRateLimit } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Resend the signup confirmation email. Deliberately generic response -
 * never reveals whether the account exists.
 *
 * Rate limited cross-instance via Upstash Redis: 3 attempts per hour per IP
 * (each hit triggers a real email send, so it is capped tighter than signup).
 */
export async function POST(request: Request) {
  const limit = await enforceRateLimit(request, "resend-confirmation", 3, 60 * 60);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many confirmation email requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const result = await resendSignupConfirmation(typeof body.email === "string" ? body.email : "");
  return NextResponse.json(result);
}
