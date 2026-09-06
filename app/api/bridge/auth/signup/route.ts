import { NextResponse } from "next/server";
import { signUpWithProfile, type SignUpInput } from "@/lib/server/authOps";
import { enforceRateLimit } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Public signup bridge. Same contract as the legacy server action
 * (lib/server/authOps.signUpWithProfile): validation, school-eligibility
 * checks, and profile creation all happen server-side. Used by the web app
 * and the standalone Android app through lib/bridgeClient.ts.
 *
 * Rate limited cross-instance via Upstash Redis: 5 attempts per hour per IP.
 */
export async function POST(request: Request) {
  const limit = await enforceRateLimit(request, "signup", 5, 60 * 60);
  if (!limit.ok) {
    return NextResponse.json(
      { success: false, error: "Too many signup attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  let input: SignUpInput;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  const result = await signUpWithProfile(input);
  return NextResponse.json(result);
}
