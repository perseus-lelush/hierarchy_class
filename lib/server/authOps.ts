/**
 * Server-only signup operations.
 *
 * Single implementation shared by the web app and the standalone Android
 * (Capacitor) app, exposed over HTTPS by the POST /api/bridge/auth/*
 * route handlers and consumed through lib/bridgeClient.ts.
 *
 * Server-only module: imports next/headers and the service-role client.
 * Never import this from a client component.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";
import { createServiceClient } from "@/lib/supabase/serviceClient";
import {
  validateSignupInput,
  parsePublicSignupRole,
  normalizeSignupIdentifiers,
  isSchoolEligibleForSignup,
  isValidEmail,
  type SignupErrors,
} from "@/lib/signupValidation";
import { siteUrlBase } from "@/lib/siteUrl";

// Type for cookie objects set by Supabase
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

export interface SignUpInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  role: string;
  schoolId: string;
  studentId?: string;
  facultyId?: string;
  isLibrarian?: boolean;
}

export type SignUpResult =
  | { success: true; userId: string }
  | { success: false; error: string; fieldErrors?: SignupErrors };

/**
 * The single, byte-identical rejection for every "already exists" outcome
 * (taken email / student ID / faculty ID). Revealing WHICH identifier is
 * registered would let an attacker enumerate accounts, so every duplicate
 * path returns this exact object - never a specific reason, never field
 * errors. The real reason is logged server-side only.
 */
const ENUMERATION_SAFE_REJECTION: SignUpResult = {
  success: false,
  error: "If the account is eligible, a confirmation email has been sent.",
};

function siteRedirectBase(): { base: string; error: string | null } {
  const base = siteUrlBase();
  if (base) return { base, error: null };
  // In production NEXT_PUBLIC_SITE_URL is required so confirmation links
  // always point at the real deployment.
  return { base: "", error: "Email confirmation isn't configured. Set NEXT_PUBLIC_SITE_URL." };
}

async function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: async () =>
        cookieStore.getAll().map((cookie) => ({ name: cookie.name, value: cookie.value })),
      setAll: async (cookiesToSet: CookieToSet[]) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

/**
 * Public signup. The role, school, and identifiers submitted by the client
 * are NEVER trusted as-is:
 *   - role must be exactly "student" or "teacher" (admin is rejected).
 *   - the school must exist, be active, and be open for registration
 *     (schools.registration_enabled) - a fake/arbitrary school UUID is
 *     rejected even though the UI only lists eligible schools.
 *   - student_id / faculty_id are required for the matching role and must
 *     be unique within the school (the database unique indexes are the
 *     final gate; the pre-check below is for clean error messages).
 *   - the password policy is enforced server-side, not just in the UI.
 */
export async function signUpWithProfile(input: SignUpInput): Promise<SignUpResult> {
  const supabase = await createSupabase();
  if (!supabase) {
    return { success: false, error: "Signup isn't configured yet." };
  }

  // 1) Pure validation (shared with the client form).
  const fieldErrors = validateSignupInput(input);
  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  const role = parsePublicSignupRole(input.role);
  if (!role) {
    // Defense in depth - validateSignupInput already rejects this.
    return { success: false, error: "Only Student and Teacher accounts can be created here." };
  }

  // 2) School eligibility from the DATABASE (never trust the selector alone).
  const { data: school, error: schoolError } = (await supabase
    .from("schools")
    .select("id, active, registration_enabled")
    .eq("id", input.schoolId)
    .maybeSingle()) as { data: { id: string; active: boolean; registration_enabled: boolean } | null; error: unknown };

  if (schoolError || !isSchoolEligibleForSignup(school)) {
    return {
      success: false,
      error: "This school isn't open for registration. Contact your school or the platform team.",
      fieldErrors: { school: "School is not accepting registrations." },
    };
  }

  // 3) Identifier normalization + duplicate pre-check (the partial unique
  //    indexes on (school_id, student_id) / (school_id, faculty_id) are the
  //    real enforcement; this is for a clean error message. The check runs
  //    through the server-only client - never exposed to the browser).
  //
  //    Anti-enumeration: taken vs free identifiers must NOT change the HTTP
  //    response (same body, same status). The specific reason is logged
  //    server-side only; the client gets the one generic message.
  const ids = normalizeSignupIdentifiers(input);
  const svc = createServiceClient();
  if (svc && ids.studentId) {
    const { data: existingStudent } = await svc
      .from("profiles")
      .select("id")
      .eq("school_id", input.schoolId)
      .eq("student_id", ids.studentId)
      .maybeSingle();
    if (existingStudent) {
      console.error("[signup] duplicate identifier (suppressed from response): student_id taken at school", {
        schoolId: input.schoolId,
      });
      return ENUMERATION_SAFE_REJECTION;
    }
  }
  if (svc && ids.facultyId) {
    const { data: existingFaculty } = await svc
      .from("profiles")
      .select("id")
      .eq("school_id", input.schoolId)
      .eq("faculty_id", ids.facultyId)
      .maybeSingle();
    if (existingFaculty) {
      console.error("[signup] duplicate identifier (suppressed from response): faculty_id taken at school", {
        schoolId: input.schoolId,
      });
      return ENUMERATION_SAFE_REJECTION;
    }
  }

  // 4) Confirmation redirect must point at the real deployment.
  const { base: siteBase, error: siteError } = siteRedirectBase();
  if (siteError) return { success: false, error: siteError };

  // 5) Sign up with Supabase Auth. The profile row (and florin balance, for
  //    students) is created by the handle_new_user() database trigger from
  //    this metadata - the trigger re-validates the role and school, so a
  //    forged payload is rejected even if this action were bypassed.
  const fullName = [input.firstName.trim(), ids.middleName, input.lastName.trim()]
    .filter(Boolean)
    .join(" ");

  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: {
        school_id: input.schoolId,
        role,
        first_name: input.firstName.trim(),
        middle_name: ids.middleName,
        last_name: input.lastName.trim(),
        name: fullName, // kept for backwards-compatible metadata readers
        student_id: ids.studentId,
        faculty_id: ids.facultyId,
        is_librarian: role === "teacher" && !!input.isLibrarian,
      },
      emailRedirectTo: `${siteBase}/auth/callback`,
    },
  });

  if (signUpError || !authData.user) {
    const message = signUpError?.message || "Signup failed";
    console.error("[signup] supabase signUp failed:", message);
    // Anti-enumeration: duplicates (school ID indexes, already-registered
    // email) return the same generic rejection as the pre-checks above -
    // never a reason that reveals which identifier exists. Detailed reason
    // stays in the server log. Wording variants observed from GoTrue:
    // "A user with this email already exists", "...has already been
    // registered", "User already registered", plus DB "duplicate key".
    if (/duplicate key|already registered|already exists|user already/i.test(message)) {
      return ENUMERATION_SAFE_REJECTION;
    }
    // Never return provider-internal error strings to the client.
    return { success: false, error: "Signup failed. Please check your details and try again." };
  }

  return { success: true, userId: authData.user.id };
}

/** Resend the signup confirmation email (Supabase auth.resend). */
export async function resendSignupConfirmation(email: string): Promise<{ ok: boolean; error?: string }> {
  if (!isValidEmail(email)) return { ok: false, error: "Enter a valid email address." };

  const supabase = await createSupabase();
  if (!supabase) return { ok: false, error: "Email confirmation isn't configured yet." };

  const { base: siteBase, error: siteError } = siteRedirectBase();
  if (siteError) return { ok: false, error: siteError };

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email.trim(),
    options: { emailRedirectTo: `${siteBase}/auth/callback` },
  });

  // Deliberately generic: never reveal whether the account exists.
  if (error) {
    return { ok: false, error: "Couldn't resend the confirmation email. Check your address and try again." };
  }
  return { ok: true };
}
