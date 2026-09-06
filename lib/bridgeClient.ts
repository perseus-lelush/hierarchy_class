/**
 * Client bridge to the server-side account/auth operations.
 *
 * The standalone Android app bundles the frontend locally and cannot invoke
 * Next.js Server Actions, so every client call goes through the backend
 * bridge API (app/api/bridge/*) which runs the SAME server implementations
 * (lib/server/authOps.ts, lib/server/accountOps.ts) on the deployed backend.
 * The web app uses this same client, so there is exactly one code path.
 *
 * Each function mirrors the return shape of the legacy server actions (same
 * { ok, error } unions) so the calling components' logic is unchanged.
 * Network failures resolve to the same error shapes instead of throwing.
 */

import { backendUrl } from "@/lib/siteUrl";
import type { SignUpInput, SignUpResult } from "@/lib/server/authOps";

/**
 * Shape returned by the legacy server actions on failure. The optional
 * undefined members mirror TypeScript's union-literal normalization of the
 * old action return types, so callers can access `.ok`, `.error`, `.decision`,
 * `.warnings`, and `.storage` exactly as they did before the bridge existed.
 */
interface OpError {
  error: string;
  ok?: undefined;
  decision?: undefined;
  warnings?: undefined;
  storage?: undefined;
}

type SimpleResult = { ok: true; error?: undefined } | OpError;
type RestrictResult = { ok: true; email: string | null; error?: undefined } | { ok: false; error: string };
type DeletionResult =
  | { ok: true; decision: "denied"; error?: undefined; warnings?: undefined; storage?: undefined }
  | {
      ok: true;
      decision: "approved";
      storage: { totalFound: number; totalDeleted: number; totalFailed: number };
      warnings?: string[];
      error?: undefined;
    }
  | OpError;

/**
 * POST to a bridge route. Returns the parsed body, or a plain `{ error }`
 * object for transport failures (offline, non-JSON, unexpected status) so
 * callers always receive their documented result shape.
 *
 * Error fidelity: a 429 carries a real, user-actionable message ("Too many
 * signup attempts") - it is surfaced verbatim instead of a generic string.
 * The offline message is reserved for genuine transport failures (the fetch
 * threw); a 200 with an unparseable body is reported as a server error, not
 * "offline" - a captive portal/HTML response used to masquerade as being
 * offline.
 */
async function postBridge<T>(path: string, body?: unknown): Promise<T | OpError> {
  let res: Response;
  try {
    res = await fetch(backendUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    return { error: "You're offline or the server is unreachable. Please try again." };
  }
  if (!res.ok) {
    // The bridge returns { error } on rate limits / rejections - surface it.
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (data && typeof data.error === "string" && data.error) {
      return { error: data.error };
    }
    return { error: `Something went wrong (server error ${res.status}). Please try again.` };
  }
  const parsed = await res.json().catch(() => null);
  if (parsed === null) {
    return { error: "The server sent an unexpected response. Please try again." };
  }
  return parsed as T;
}

export async function signUpWithProfile(input: SignUpInput): Promise<SignUpResult> {
  const result = await postBridge<SignUpResult>("/api/bridge/auth/signup", input);
  if (result && typeof result === "object" && "success" in result) return result;
  return { success: false, error: "error" in result ? result.error : "Signup failed" };
}

export async function resendSignupConfirmation(
  email: string
): Promise<{ ok: true; error?: undefined } | { ok: false; error: string }> {
  const result = await postBridge<{ ok: boolean; error?: string }>(
    "/api/bridge/auth/resend-confirmation",
    { email }
  );
  if (typeof result === "object" && "ok" in result) {
    return result.ok ? { ok: true } : { ok: false, error: result.error ?? "Couldn't resend." };
  }
  return {
    ok: false,
    error: "Couldn't resend the confirmation email. Check your address and try again.",
  };
}

export async function deactivateAccount(): Promise<SimpleResult> {
  return postBridge<Extract<SimpleResult, { ok: true }>>("/api/bridge/account/deactivate");
}

export async function reactivateAccount(): Promise<SimpleResult> {
  return postBridge<Extract<SimpleResult, { ok: true }>>("/api/bridge/account/reactivate");
}

export async function adminRestrictUser(
  profileId: string,
  reason?: string
): Promise<RestrictResult> {
  const result = await postBridge<Extract<RestrictResult, { ok: true }>>("/api/bridge/account/restrict", {
    profileId,
    reason,
  });
  if (result && typeof result === "object" && "ok" in result) {
    return result.ok ? { ok: true, email: result.email ?? null } : { ok: false, error: result.error };
  }
  return { ok: false, error: "error" in result ? result.error : "Couldn't update the account." };
}

export async function adminUnrestrictUser(profileId: string): Promise<SimpleResult> {
  const result = await postBridge<Extract<SimpleResult, { ok: true }>>("/api/bridge/account/unrestrict", {
    profileId,
  });
  if (result && typeof result === "object" && "ok" in result && result.ok) {
    return { ok: true };
  }
  return { error: "error" in result ? result.error : "Couldn't update the account." };
}

export async function submitAppeal(reason: string): Promise<SimpleResult> {
  return postBridge<Extract<SimpleResult, { ok: true }>>("/api/bridge/account/appeals", { reason });
}

export async function resolveAppeal(appealId: string, approved: boolean): Promise<SimpleResult> {
  return postBridge<Extract<SimpleResult, { ok: true }>>("/api/bridge/account/appeals/resolve", {
    appealId,
    approved,
  });
}

export async function resolveDeletionRequest(
  requestId: string,
  decision: "approved" | "denied"
): Promise<DeletionResult> {
  return postBridge<Exclude<DeletionResult, OpError>>("/api/bridge/account/deletion-requests/resolve", {
    requestId,
    decision,
  });
}
