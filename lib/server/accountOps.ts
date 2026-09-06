/**
 * Server-only account lifecycle operations.
 *
 * Single implementation shared by the web app and the standalone Android
 * (Capacitor) app, exposed over HTTPS by the POST /api/bridge/account/*
 * route handlers and consumed through lib/bridgeClient.ts.
 *
 * Server-only module: imports next/headers and the service-role client.
 * Never import this from a client component.
 */

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import type { Database, ProfileRow, AccountRequestRow, AccountAppealRow } from "@/types/supabase";
import { createServiceClient } from "@/lib/supabase/serviceClient";
import { storagePathFromUrl } from "@/lib/uploadUtils";

// Account lifecycle operations.
//
// DEACTIVATION / REACTIVATION - self-service, reversible, no admin step.
//   Runs through the caller's own session against the anon-key server client,
//   so RLS (profiles_user_updates_own) is the gate: a user can only touch
//   their own row. No service role involved.
//
// DELETION - admin-approved. The admin's session (anon key + RLS) verifies
//   the caller is an admin of the same school as the pending request and the
//   target profile; only then does the service-role client delete the auth
//   user (which cascades profiles and anonymizes school records via
//   migration 058) and remove the user's storage objects.

interface CookieToSet {
  name: string;
  value: string;
  options?: {
    maxAge?: number;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
    path?: string;
  };
}

type SessionClient = NonNullable<Awaited<ReturnType<typeof createSessionClient>>>;

async function createSessionClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  // Android (Capacitor) bridge calls carry the device's Supabase access
  // token in an Authorization header - the WebView holds no cookies for the
  // backend origin, so the cookie path can never work there. When present,
  // the JWT is forwarded to PostgREST on every query, so RLS runs as that
  // user exactly like the cookie session would.
  const authHeader = (await headers()).get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return createClient<Database>(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
  }

  const cookieStore = await cookies();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: async () => cookieStore.getAll(),
      setAll: async (cookiesToSet: CookieToSet[]) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
      },
    },
  });
}

async function currentProfile(supabase: SessionClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null as null, profile: null as null };

  // Note: this project's supabase-js types `.single()`/`.maybeSingle()` as
  // `never`, so results are cast - same convention as the rest of the codebase.
  const { data: profile } = (await supabase
    .from("profiles")
    .select("id, school_id, role, deactivated_at, restricted_at")
    .eq("user_id", user.id)
    .maybeSingle()) as { data: ProfileRow | null };

  return { user, profile: profile ?? null };
}

/** Self-service deactivation: sets deactivated_at, nothing is deleted. */
export async function deactivateAccount() {
  const supabase = await createSessionClient();
  if (!supabase) return { error: "Account management isn't configured." };
  const { profile } = await currentProfile(supabase);
  if (!profile) return { error: "Not signed in." };

  const { error } = await (supabase.from("profiles") as any)
    .update({ deactivated_at: new Date().toISOString() })
    .eq("id", profile.id);

  if (error) return { error: "Couldn't deactivate your account. Please try again." };
  return { ok: true as const };
}

/**
 * Self-service reactivation: clears deactivated_at and creates the
 * "welcome back" notification via the existing create_notification RPC
 * (recipient = self, so the same-school check passes).
 */
export async function reactivateAccount() {
  const supabase = await createSessionClient();
  if (!supabase) return { error: "Account management isn't configured." };
  const { user, profile } = await currentProfile(supabase);
  if (!user || !profile) return { error: "Not signed in." };

  if (!profile.deactivated_at) return { error: "Your account is already active." };

  const { error } = await (supabase.from("profiles") as any)
    .update({ deactivated_at: null })
    .eq("id", profile.id);
  if (error) return { error: "Couldn't reactivate your account. Please try again." };

  // Welcome-back notification (existing SECURITY DEFINER RPC, no new system).
  await (supabase as any).rpc("create_notification", {
    p_recipient_id: profile.id,
    p_type: "system",
    p_title: "Welcome back!",
    p_body: "Your Hierarchy Class account has been reactivated. Welcome back!",
  });

  return { ok: true as const };
}

/**
 * School admins CANNOT deactivate or reactivate other users' accounts.
 * Deactivation is self-service only (see deactivateAccount), and permanent
 * deletion is a separate admin-approved request (see resolveDeletionRequest).
 * The only admin-initiated account lifecycle action is the temporary
 * RESTRICTION of a suspicious account (adminRestrictUser) - a controlled,
 * reversible state that keeps the user on the appeal flow.
 */

/**
 * Temporarily restrict a suspicious account in the admin's OWN school.
 *
 * This is NOT deactivation: the user can still authenticate, but the
 * middleware routes them to /auth/restricted where they see the notice and
 * can appeal. Authorization is verified server-side (caller must be an admin
 * of the same school; target must not be an admin), and RLS
 * (profiles_admin_update) enforces the same school scope at the row level.
 *
 * Returns the target email when available so the caller can send a notice.
 */
type RestrictionCommonResult =
  | { ok: true; caller: { id: string; school_id: string; role: string; full_name: string }; target: { id: string; full_name: string } }
  | { ok: false; error: string };

async function adminRestrictionCommon(profileId: string, restrict: boolean): Promise<RestrictionCommonResult> {
  const supabase = await createSessionClient();
  if (!supabase) return { ok: false, error: "Account management isn't configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: caller } = (await supabase
    .from("profiles")
    .select("id, school_id, role, full_name")
    .eq("user_id", user.id)
    .single()) as { data: ProfileRow | null };
  if (!caller || caller.role !== "admin") {
    return { ok: false, error: "Only a school admin can manage restrictions." };
  }

  const { data: target } = (await supabase
    .from("profiles")
    .select("id, user_id, school_id, role, full_name, restricted_at")
    .eq("id", profileId)
    .single()) as { data: ProfileRow | null };
  if (!target) return { ok: false, error: "User not found." };
  if (target.school_id !== caller.school_id) {
    return { ok: false, error: "This user belongs to another school." };
  }
  if (target.role === "admin") {
    return { ok: false, error: "Admin accounts are managed by the platform owner." };
  }

  // Update restricted_at through the session client - RLS (profiles_admin_update)
  // is the final gate and re-verifies the same-school admin scope.
  const { error } = await (supabase.from("profiles") as any)
    .update({ restricted_at: restrict ? new Date().toISOString() : null })
    .eq("id", target.id);
  if (error) {
    return { ok: false, error: "Couldn't update the account. Please try again." };
  }

  return { ok: true as const, caller, target };
}

export async function adminRestrictUser(profileId: string, reason?: string) {
  const result = await adminRestrictionCommon(profileId, true);
  if (!result.ok) return { ok: false, error: result.error };
  const { target } = result;

  // Fetch the target's email through the SECURITY DEFINER helper (only a
  // same-school admin gets it) and email the restriction notice server-side.
  // Best-effort: the restriction itself never depends on the email sending.
  const supabase = await createSessionClient();
  let email: string | null = null;
  if (supabase) {
    const { data: emailRow } = (await (supabase as any).rpc("get_profile_email", {
      p_profile_id: target.id,
    })) as { data: string | null };
    email = emailRow ?? null;
  }

  if (email) {
    const { sendEmail } = await import("@/lib/email");
    await sendEmail({
      to: email,
      subject: "Your Hierarchy Class account was temporarily restricted",
      text: [
        `Hi ${target.full_name},`,
        "",
        "We're sorry - your Hierarchy Class account was temporarily restricted from accessing the app while our school administrators review your account.",
        reason && reason.trim() ? `Reason provided: ${reason.trim()}` : "",
        "",
        "You can still sign in, but you will only be able to reach the restriction page. If you believe this was a mistake, you can submit an appeal there and a school administrator will review it.",
        "",
        "- Hierarchy Class",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }

  // The restriction itself is recorded in profiles.restricted_at; the
  // restricted user sees the notice + appeal form on /auth/restricted.
  return { ok: true as const, email };
}

export async function adminUnrestrictUser(profileId: string) {
  const result = await adminRestrictionCommon(profileId, false);
  if (!result.ok) return { ok: false, error: result.error };
  const { target } = result;

  // Tell the user their access is restored (in-app notification).
  const supabase = await createSessionClient();
  if (supabase) {
    await (supabase as any).rpc("create_notification", {
      p_recipient_id: target.id,
      p_type: "system",
      p_title: "Your access has been restored",
      p_body: "A school administrator reviewed your account and restored your access to Hierarchy Class.",
    });
  }

  return { ok: true as const };
}

/**
 * Restricted user submits an appeal. The row is inserted through RLS
 * (appeals_own_create requires the caller's own restricted profile) and the
 * partial unique index enforces one open appeal per user. School admins are
 * notified so they can review it.
 */
export async function submitAppeal(reason: string) {
  const supabase = await createSessionClient();
  if (!supabase) return { error: "Account management isn't configured." };

  const trimmed = reason.trim();
  if (!trimmed) return { error: "Explain why your account should be restored." };
  if (trimmed.length > 2000) return { error: "Appeal is too long (2,000 character limit)." };

  const { profile } = await currentProfile(supabase);
  if (!profile) return { error: "Not signed in." };
  if (!profile.restricted_at) return { error: "Your account isn't restricted." };

  // Re-check there is no open appeal (the DB unique index is the real gate;
  // this gives a clean message).
  const { data: existing } = (await supabase
    .from("account_appeals")
    .select("id")
    .eq("user_id", profile.id)
    .eq("status", "pending")
    .maybeSingle()) as { data: { id: string } | null };
  if (existing) return { error: "You already have a pending appeal. A school administrator will review it." };

  const { error: insertError } = await supabase.from("account_appeals").insert({
    school_id: profile.school_id,
    user_id: profile.id,
    reason: trimmed,
  } as any);
  if (insertError) {
    if (/duplicate key/i.test(insertError.message)) {
      return { error: "You already have a pending appeal. A school administrator will review it." };
    }
    return { error: "Couldn't submit your appeal. Please try again." };
  }

  // Notify the school's admins (existing SECURITY DEFINER RPC, same school).
  await (supabase as any).rpc("notify_admins", {
    p_school_id: profile.school_id,
    p_type: "system",
    p_title: "Account appeal submitted",
    p_body: `${profile.full_name ?? "A user"} appealed their account restriction and is waiting for review.`,
  });

  return { ok: true as const };
}

/**
 * Admin reviews an appeal. Approving restores access (clears restricted_at);
 * denying leaves the account restricted. The appeal row update runs through
 * RLS (appeals_admin_all scopes to the admin's school), and the caller must
 * be an admin of the appeal's school.
 */
export async function resolveAppeal(appealId: string, approved: boolean) {
  const supabase = await createSessionClient();
  if (!supabase) return { error: "Account management isn't configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: caller } = (await supabase
    .from("profiles")
    .select("id, school_id, role")
    .eq("user_id", user.id)
    .single()) as { data: ProfileRow | null };
  if (!caller || caller.role !== "admin") {
    return { error: "Only a school admin can review appeals." };
  }

  const { data: appeal } = (await supabase
    .from("account_appeals")
    .select("*")
    .eq("id", appealId)
    .single()) as { data: AccountAppealRow | null };
  if (!appeal) return { error: "Appeal not found." };
  if (appeal.school_id !== caller.school_id) {
    return { error: "This appeal belongs to another school." };
  }

  // Atomically claim the pending appeal: only ONE concurrent admin can flip
  // it out of 'pending'. The loser sees zero updated rows and stops here -
  // check-then-act let two approvals race and double-notify the student.
  const { data: claimed, error: claimError } = await (supabase.from("account_appeals") as any)
    .update({
      status: approved ? "approved" : "denied",
      reviewed_by: caller.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", appeal.id)
    .eq("status", "pending")
    .select("id");
  if (claimError) return { error: "Couldn't record the decision." };
  if (!claimed || claimed.length === 0) {
    return { error: "This appeal was already reviewed by another admin." };
  }

  // Approving restores access; denying keeps the account restricted.
  if (approved) {
    const { error: restoreError } = await (supabase.from("profiles") as any)
      .update({ restricted_at: null })
      .eq("id", appeal.user_id);
    if (restoreError) return { error: "Couldn't restore the account. Please try again." };
  }

  // Tell the user the outcome.
  await (supabase as any).rpc("create_notification", {
    p_recipient_id: appeal.user_id,
    p_type: "system",
    p_title: approved ? "Your appeal was approved" : "Your appeal was not approved",
    p_body: approved
      ? "A school administrator restored your access to Hierarchy Class. You can sign in normally now."
      : "A school administrator reviewed your appeal and your account remains restricted. Contact your school if you believe this is an error.",
  });

  return { ok: true as const };
}

type Decision = "approved" | "denied";

/**
 * Admin resolution of a pending DELETION request. Denying just records the
 * decision. Approving executes the permanent deletion: storage objects are
 * collected first, the auth user is deleted (cascade -> profile gone, school
 * records preserved/anonymized by migration 058), then the collected files
 * are removed. Any failure before the auth-user delete reverts the request to
 * pending so nothing is half-destroyed.
 */
export async function resolveDeletionRequest(requestId: string, decision: Decision) {
  const supabase = await createSessionClient();
  if (!supabase) return { error: "Account management isn't configured." };

  // 1. Authenticated caller must be a school admin.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: caller } = (await supabase
    .from("profiles")
    .select("id, school_id, role")
    .eq("user_id", user.id)
    .single()) as { data: ProfileRow | null };
  if (!caller || caller.role !== "admin") {
    return { error: "Only a school admin can review deletion requests." };
  }

  // 2. The request must exist, be a pending deletion, and belong to the
  //    admin's own school (RLS already limits the read; verified again here).
  const { data: req } = (await supabase
    .from("account_requests")
    .select("*")
    .eq("id", requestId)
    .single()) as { data: AccountRequestRow | null };
  if (!req) return { error: "Request not found." };
  if (req.type !== "deletion") return { error: "Only deletion requests can be reviewed here." };
  if (req.status !== "pending") return { error: "This request was already reviewed." };
  if (req.school_id !== caller.school_id) {
    return { error: "This request belongs to another school." };
  }

  // 3. The target profile must exist and be in the same school.
  const { data: target } = (await supabase
    .from("profiles")
    .select("id, user_id, school_id, role, avatar_url")
    .eq("id", req.requester_id)
    .single()) as { data: ProfileRow | null };
  if (!target || target.school_id !== caller.school_id) {
    return { error: "The account to delete isn't in your school." };
  }
  if (!target.user_id) {
    return { error: "The account has no auth user to delete." };
  }

  // Deny: record the decision, no destructive work.
  if (decision === "denied") {
    const { error: denyError } = await (supabase.from("account_requests") as any)
      .update({
        status: "denied",
        reviewed_by: caller.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", req.id);
    if (denyError) return { error: "Couldn't record the decision." };
    return { ok: true as const, decision: "denied" as const };
  }

  // Approve -> execute the deletion.
  const svc = createServiceClient();
  if (!svc) {
    return { error: "Permanent deletion isn't configured on this server yet." };
  }

  // Atomically claim the pending request: only ONE concurrent admin can flip
  // it out of 'pending'. The loser sees zero updated rows and stops here -
  // previously a check-then-act race let a second approval run deleteUser
  // (which fails on the already-deleted user) and revert the request to
  // 'pending' for an account that no longer exists.
  const { data: claimed, error: claimError } = await (supabase.from("account_requests") as any)
    .update({
      status: "approved",
      reviewed_by: caller.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", req.id)
    .eq("status", "pending")
    .select("id");
  if (claimError) return { error: "Couldn't record the approval." };
  if (!claimed || claimed.length === 0) {
    return { error: "This request was already reviewed by another admin." };
  }

  // Collect storage paths BEFORE the auth-user delete (after it, the DB rows
  // that point at the files are gone).
  const paths = await collectStoragePaths(supabase, target);

  // Delete the auth user. auth.users -> profiles ON DELETE CASCADE removes the
  // profile; migration 058's SET NULL FKs keep school records anonymized.
  const { error: deleteError } = await svc.auth.admin.deleteUser(target.user_id);
  if (deleteError) {
    // Account still exists - revert the request so it stays reviewable.
    await (supabase.from("account_requests") as any)
      .update({ status: "pending", reviewed_by: null, reviewed_at: null })
      .eq("id", req.id);
    return { error: "Deletion failed. No data was removed; the request is back to pending." };
  }

  // Storage cleanup (best effort per bucket - the account is already gone, so
  // any failure here only leaves orphaned files, never a half-deleted account).
  // Failures are NOT silent: counts + failed paths/errors are reported back so
  // orphaned files can be tracked and cleaned up manually.
  const storage: Record<string, { found: number; deleted: number; failed: number; errors: string[] }> = {};
  for (const bucket of ["avatars", "certificates", "myday", "materials", "feed"] as const) {
    storage[bucket] = await removePaths(svc, bucket, paths[bucket]);
  }

  const totalFound = Object.values(storage).reduce((n, s) => n + s.found, 0);
  const totalDeleted = Object.values(storage).reduce((n, s) => n + s.deleted, 0);
  const totalFailed = Object.values(storage).reduce((n, s) => n + s.failed, 0);
  const warnings = Object.values(storage)
    .flatMap((s) => s.errors)
    .map((e) => `Storage cleanup: ${e}`);

  return {
    ok: true as const,
    decision: "approved" as const,
    storage: { totalFound, totalDeleted, totalFailed },
    warnings: warnings.length ? warnings : undefined,
  };
}

async function collectStoragePaths(
  supabase: SessionClient,
  target: { id: string; avatar_url: string | null }
) {
  const paths: Record<"avatars" | "certificates" | "myday" | "materials" | "feed", string[]> = {
    avatars: [],
    certificates: [],
    myday: [],
    materials: [],
    feed: [],
  };

  if (target.avatar_url) {
    const p = storagePathFromUrl(target.avatar_url, "avatars");
    if (p) paths.avatars.push(p);
  }

  const [achievementsRes, storiesRes, materialsRes, postsRes] = await Promise.all([
    supabase.from("student_achievements").select("image_path").eq("student_id", target.id),
    supabase.from("stories").select("image_path").eq("user_id", target.id),
    supabase.from("learning_materials").select("url").eq("uploaded_by", target.id),
    supabase.from("school_feed_posts").select("image_path").eq("author_id", target.id),
  ]);

  paths.certificates = ((achievementsRes.data ?? []) as { image_path: string }[])
    .map((a) => storagePathFromUrl(a.image_path, "certificates"))
    .filter((p): p is string => !!p);
  paths.myday = ((storiesRes.data ?? []) as { image_path: string | null }[])
    .map((s) => s.image_path)
    .filter((p): p is string => !!p);
  paths.materials = ((materialsRes.data ?? []) as { url: string | null }[])
    .map((m) => m.url)
    .filter((p): p is string => !!p);
  paths.feed = ((postsRes.data ?? []) as { image_path: string | null }[])
    .map((p) => p.image_path)
    .filter((p): p is string => !!p);

  return paths;
}

async function removePaths(
  svc: NonNullable<ReturnType<typeof createServiceClient>>,
  bucket: string,
  paths: string[]
): Promise<{ found: number; deleted: number; failed: number; errors: string[] }> {
  if (paths.length === 0) return { found: 0, deleted: 0, failed: 0, errors: [] };
  const { error } = await svc.storage.from(bucket).remove(paths);
  if (error) {
    return { found: paths.length, deleted: 0, failed: paths.length, errors: [`${bucket}: ${error.message}`] };
  }
  return { found: paths.length, deleted: paths.length, failed: 0, errors: [] };
}
