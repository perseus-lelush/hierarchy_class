/**
 * Shared, pure signup validation.
 *
 * Used by BOTH the signup bridge route (app/api/bridge/auth/signup →
 * lib/server/authOps.ts) and the client form
 * (components/auth/SignupForm.tsx) so the UI and the server enforce exactly
 * the same policy. Also unit-tested in lib/signupValidation.test.ts.
 *
 * Nothing here touches the database - school eligibility and identifier
 * uniqueness are checked by the server bridge implementation (against the
 * schools/profiles tables) on top of these rules.
 */

export const PUBLIC_SIGNUP_ROLES = ["student", "teacher"] as const;
export type PublicSignupRole = (typeof PUBLIC_SIGNUP_ROLES)[number];

export const MIN_PASSWORD_LENGTH = 8;

export interface SignupInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  /** Raw role string from the client - MUST be validated, never trusted. */
  role: string;
  schoolId: string;
  studentId?: string;
  facultyId?: string;
  isLibrarian?: boolean;
}

export interface EligibleSchool {
  id: string;
  active: boolean;
  registration_enabled: boolean;
}

export type SignupField =
  | "email"
  | "password"
  | "firstName"
  | "lastName"
  | "school"
  | "role"
  | "studentId"
  | "facultyId"
  | "form";

export type SignupErrors = Partial<Record<SignupField, string>>;

/** Trim + collapse internal whitespace so IDs compare consistently. */
export function normalizeIdentifier(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Maps an arbitrary client-supplied role to a public signup role.
 * Anything other than "student"/"teacher" (including "admin", "Administrator",
 * "" or random strings) returns null -> the signup must be rejected.
 */
export function parsePublicSignupRole(value: unknown): PublicSignupRole | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "student") return "student";
  if (normalized === "teacher") return "teacher";
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** Strong-password policy: minimum length plus a mixture of letters and
 *  digits. Maximum is 72 BYTES - bcrypt (GoTrue's hasher) truncates beyond
 *  that, which used to surface as an opaque provider error at signup. */
const MAX_PASSWORD_BYTES = 72;

export function passwordPolicyError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return "Password is too long (maximum 72 characters).";
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must contain at least one letter and one number.";
  }
  return null;
}

/** Runtime-safe string coercion - the server forwards raw JSON bodies, so
 *  any field can arrive as a number/object/null. Never deref before this. */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Validates the full signup payload. Pure - takes the raw input and returns
 * field-level errors. The server action additionally verifies school
 * eligibility and identifier uniqueness against the database.
 */
export function validateSignupInput(input: SignupInput): SignupErrors {
  const errors: SignupErrors = {};

  if (!asString(input.firstName).trim()) errors.firstName = "Enter your first name.";
  if (!asString(input.lastName).trim()) errors.lastName = "Enter your last name.";

  const email = asString(input.email).trim();
  if (!email) {
    errors.email = "Enter your email.";
  } else if (!isValidEmail(email)) {
    errors.email = "Enter a valid email address.";
  }

  const passwordError = passwordPolicyError(asString(input.password));
  if (passwordError) errors.password = passwordError;

  if (!input.schoolId) errors.school = "Please select your school.";

  // ROLE IS THE SECURITY-CRITICAL CHECK: only student/teacher may sign up
  // publicly. An explicit admin attempt is rejected with a clear message.
  const role = parsePublicSignupRole(input.role);
  if (!role) {
    // input.role is raw client data and may be missing/non-string - guard
    // before dereferencing so a malformed body gets a field error, not a 500.
    const rawRole = typeof input.role === "string" ? input.role.trim().toLowerCase() : "";
    errors.role =
      rawRole === "admin"
        ? "Administrator accounts cannot be created through signup."
        : "Choose Student or Teacher.";
    return errors;
  }

  const studentId = normalizeIdentifier(input.studentId ?? "");
  const facultyId = normalizeIdentifier(input.facultyId ?? "");

  if (role === "student") {
    if (!studentId) errors.studentId = "Enter your school-issued student ID.";
  } else {
    if (!facultyId) errors.facultyId = "Enter your school-issued faculty ID.";
  }

  return errors;
}

/** Normalized identifiers a server action should persist (trimmed). */
export function normalizeSignupIdentifiers(input: SignupInput): {
  studentId: string | null;
  facultyId: string | null;
  middleName: string | null;
} {
  const role = parsePublicSignupRole(input.role);
  return {
    studentId: role === "student" ? normalizeIdentifier(asString(input.studentId)) || null : null,
    facultyId: role === "teacher" ? normalizeIdentifier(asString(input.facultyId)) || null : null,
    middleName: normalizeIdentifier(asString(input.middleName)) || null,
  };
}

/**
 * A school is eligible for public signup only when it exists, is active, and
 * the platform owner has opened it for registration.
 */
export function isSchoolEligibleForSignup(school: EligibleSchool | null | undefined): boolean {
  return !!school && school.active === true && school.registration_enabled === true;
}
