"use client";

import { useState } from "react";
import Link from "next/link";
import { School } from "@/types/school";
import { useSchools } from "@/lib/useSchools";
import { SchoolSelector } from "@/components/auth/SchoolSelector";
import { signUpWithProfile, resendSignupConfirmation } from "@/lib/bridgeClient";
import {
  validateSignupInput,
  type PublicSignupRole,
  type SignupErrors,
} from "@/lib/signupValidation";
import { advanceNativeInput } from "@/lib/native";
import { NativeAuthShell } from "@/components/native/NativeAuthShell";

const ROLE_OPTIONS: { value: PublicSignupRole; label: string; hint: string }[] = [
  { value: "student", label: "Student", hint: "I'm enrolling at this school" },
  { value: "teacher", label: "Teacher", hint: "I teach at this school" },
];

type Mode = "form" | "checkEmail";

/**
 * Android (Capacitor) signup screen.
 *
 * A dedicated mobile-first signup presentation for the standalone Android app,
 * separate from the desktop web signup UI (components/auth/SignupForm.tsx).
 * Reuses the exact same shared validation (lib/signupValidation.ts), bridge
 * API (lib/bridgeClient.ts), school selector, and Supabase session handling;
 * only the presentation differs.
 *
 * Preserves ALL existing required fields: role, first/last/middle name,
 * student/faculty ID, email, password, school, isLibrarian (teacher), terms.
 * Every field and rule matches the web signup exactly.
 *
 * Rendered only by the Android export build (app/signup gates on
 * CAPACITOR_EXPORT); the web deployment never mounts this component.
 */
export function NativeSignup() {
  const { schools, loading: schoolsLoading, error: schoolsError } = useSchools();
  const [mode, setMode] = useState<Mode>("form");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [school, setSchool] = useState<School | null>(null);
  const [role, setRole] = useState<PublicSignupRole>("student");
  const [studentId, setStudentId] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [isLibrarian, setIsLibrarian] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<SignupErrors & { terms?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  function validate(): boolean {
    const fieldErrors = validateSignupInput({
      email,
      password,
      firstName,
      lastName,
      middleName,
      role,
      schoolId: school?.id ?? "",
      studentId,
      facultyId,
      isLibrarian,
    });
    const next: SignupErrors & { terms?: string } = { ...fieldErrors };
    if (!acceptedTerms) next.terms = "You must accept the Terms and Conditions to continue.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!validate()) return;

    setIsLoading(true);

    try {
      const supabaseConfigured =
        !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseConfigured) {
        setFormError("Signup isn't configured yet on this build.");
        return;
      }

      if (!school) {
        setErrors((prev) => ({ ...prev, school: "Please select your school." }));
        setIsLoading(false);
        return;
      }

      const result = await signUpWithProfile({
        email,
        password,
        firstName,
        lastName,
        middleName,
        role,
        schoolId: school.id,
        studentId,
        facultyId,
        isLibrarian,
      });

      if (!result.success) {
        if (result.fieldErrors) setErrors((prev) => ({ ...prev, ...result.fieldErrors }));
        setFormError(result.error);
        return;
      }

      // Confirmation email sent - show the verification state.
      setMode("checkEmail");
    } catch {
      setFormError("Something went wrong. Try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setResendStatus(null);
    const result = await resendSignupConfirmation(email);
    setResending(false);
    setResendStatus(
      result.ok
        ? "A new confirmation link was sent. Check your inbox (and spam folder)."
        : result.error ?? "Couldn't resend. Try again in a moment."
    );
  }

  if (mode === "checkEmail") {
    return (
      <NativeAuthShell>
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-[var(--accent)]">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M22 7l-10 6L2 7" />
            </svg>
          </span>
          <h2 className="text-lg font-bold text-[var(--text)]">Check your email</h2>
          <p className="text-sm leading-6 text-[var(--muted)]">
            We&apos;ve sent a confirmation link to <span className="font-semibold text-[var(--text)]">{email}</span>.
            Confirm your email before logging in.
          </p>
          {resendStatus && (
            <p className={`text-xs ${resendStatus.startsWith("A new") ? "text-accent-token" : "text-warn"}`}>
              {resendStatus}
            </p>
          )}
          <div className="mt-2 flex w-full flex-col gap-2">
            <button
              type="button"
              disabled={resending}
              onClick={handleResend}
              className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-navy text-sm font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-90 disabled:opacity-60 touch-manipulation"
            >
              {resending ? "Sending..." : "Resend confirmation email"}
            </button>
            <Link
              replace
              href="/login"
              className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-base text-sm font-bold uppercase tracking-widest text-navy transition hover:border-accent-soft touch-manipulation"
            >
              Back to login
            </Link>
          </div>
        </div>
      </NativeAuthShell>
    );
  }

  return (
    <NativeAuthShell>
      <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col">
        <p className="text-center text-[15px] font-semibold text-[var(--text)]">Create your account</p>

        {formError && (
          <div className="mt-4 rounded-lg border border-warn-soft bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
            {formError}
          </div>
        )}

        {/* Account type: Student / Teacher */}
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {ROLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRole(option.value)}
              className={`rounded-xl border px-4 py-3.5 text-left transition ${
                role === option.value
                  ? "border-accent-token bg-[var(--surface-strong)]"
                  : "border-base bg-surface hover:border-accent-soft"
              }`}
            >
              <span className={`block text-sm font-bold ${role === option.value ? "text-[var(--text)]" : "text-[var(--muted)]"}`}>
                {option.label}
              </span>
              <span className="mt-0.5 block text-[11px] text-[var(--faint)]">{option.hint}</span>
            </button>
          ))}
        </div>
        {errors.role && <p className="mt-1 text-xs text-warn">{errors.role}</p>}

        {/* Name fields */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="native-fn" className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              First name
            </label>
            <input
              id="native-fn"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jane"
              disabled={isLoading}
              autoComplete="given-name"
              enterKeyHint="next"
              onKeyDown={(e) => advanceNativeInput(e, "native-ln")}
              className={`h-12 w-full rounded-xl border bg-surface px-4 text-[15px] text-[var(--text)] outline-none transition-all placeholder:text-[var(--faint)] disabled:bg-tile disabled:text-faint
                ${errors.firstName ? "border-warn-soft" : "border-base focus:border-[var(--accent)] focus:ring-[3px] focus:ring-[rgba(158,167,179,0.18)]"}`}
            />
            {errors.firstName && <p className="text-xs text-warn">{errors.firstName}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="native-ln" className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Last name
            </label>
            <input
              id="native-ln"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Doe"
              disabled={isLoading}
              autoComplete="family-name"
              enterKeyHint="next"
              onKeyDown={(e) => advanceNativeInput(e, "native-mn")}
              className={`h-12 w-full rounded-xl border bg-surface px-4 text-[15px] text-[var(--text)] outline-none transition-all placeholder:text-[var(--faint)] disabled:bg-tile disabled:text-faint
                ${errors.lastName ? "border-warn-soft" : "border-base focus:border-[var(--accent)] focus:ring-[3px] focus:ring-[rgba(158,167,179,0.18)]"}`}
            />
            {errors.lastName && <p className="text-xs text-warn">{errors.lastName}</p>}
          </div>
        </div>

        {/* Middle name */}
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="native-mn" className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Middle name <span className="font-normal normal-case text-[var(--faint)]">(optional)</span>
          </label>
          <input
            id="native-mn"
            type="text"
            value={middleName}
            onChange={(e) => setMiddleName(e.target.value)}
            placeholder="Marie"
            disabled={isLoading}
            autoComplete="additional-name"
            enterKeyHint="next"
            onKeyDown={(e) => advanceNativeInput(e, role === "student" ? "native-sid" : "native-fid")}
            className="h-12 w-full rounded-xl border border-base bg-surface px-4 text-[15px] text-[var(--text)] outline-none transition-all placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:ring-[3px] focus:ring-[rgba(158,167,179,0.18)] disabled:bg-tile disabled:text-faint"
          />
        </div>

        {/* Student ID / Faculty ID */}
        {role === "student" ? (
          <div className="mt-4 flex flex-col gap-1.5">
            <label htmlFor="native-sid" className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Student ID
            </label>
            <input
              id="native-sid"
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="Your school-issued ID (e.g. 2024-1001)"
              disabled={isLoading}
              autoComplete="off"
              enterKeyHint="next"
              onKeyDown={(e) => advanceNativeInput(e, "native-email")}
              className={`h-12 w-full rounded-xl border bg-surface px-4 text-[15px] text-[var(--text)] outline-none transition-all placeholder:text-[var(--faint)] disabled:bg-tile disabled:text-faint
                ${errors.studentId ? "border-warn-soft" : "border-base focus:border-[var(--accent)] focus:ring-[3px] focus:ring-[rgba(158,167,179,0.18)]"}`}
            />
            {errors.studentId && <p className="text-xs text-warn">{errors.studentId}</p>}
            <p className="text-[11px] text-[var(--faint)]">The ID your school issued to you - not a password, and never shared.</p>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-1.5">
            <label htmlFor="native-fid" className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Faculty ID
            </label>
            <input
              id="native-fid"
              type="text"
              value={facultyId}
              onChange={(e) => setFacultyId(e.target.value)}
              placeholder="Your school-issued faculty ID"
              disabled={isLoading}
              autoComplete="off"
              enterKeyHint="next"
              onKeyDown={(e) => advanceNativeInput(e, "native-email")}
              className={`h-12 w-full rounded-xl border bg-surface px-4 text-[15px] text-[var(--text)] outline-none transition-all placeholder:text-[var(--faint)] disabled:bg-tile disabled:text-faint
                ${errors.facultyId ? "border-warn-soft" : "border-base focus:border-[var(--accent)] focus:ring-[3px] focus:ring-[rgba(158,167,179,0.18)]"}`}
            />
            {errors.facultyId && <p className="text-xs text-warn">{errors.facultyId}</p>}
          </div>
        )}

        {/* Email */}
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="native-email" className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Email
          </label>
          <input
            id="native-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={isLoading}
            autoComplete="email"
            inputMode="email"
            enterKeyHint="next"
            onKeyDown={(e) => advanceNativeInput(e, "native-pass")}
            className={`h-12 w-full rounded-xl border bg-surface px-4 text-[15px] text-[var(--text)] outline-none transition-all placeholder:text-[var(--faint)] disabled:bg-tile disabled:text-faint
              ${errors.email ? "border-warn-soft" : "border-base focus:border-[var(--accent)] focus:ring-[3px] focus:ring-[rgba(158,167,179,0.18)]"}`}
          />
          {errors.email && <p className="text-xs text-warn">{errors.email}</p>}
        </div>

        {/* Password */}
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="native-pass" className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Password
          </label>
          <div className="relative">
            <input
              id="native-pass"
              type={showPassword ? "text" : "password"}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters, with a letter and a number"
              disabled={isLoading}
              autoComplete="new-password"
              enterKeyHint="go"
              className={`h-12 w-full rounded-xl border bg-surface px-4 pr-12 text-[15px] text-[var(--text)] outline-none transition-all placeholder:text-[var(--faint)] disabled:bg-tile disabled:text-faint
                ${errors.password ? "border-warn-soft" : "border-base focus:border-[var(--accent)] focus:ring-[3px] focus:ring-[rgba(158,167,179,0.18)]"}`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--faint)] transition hover:text-[var(--text)]"
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a21.8 21.8 0 015.06-6.06M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 8 11 8a21.75 21.75 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                  <path d="M1 1l22 22" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {errors.password && <p className="text-xs text-warn">{errors.password}</p>}
        </div>

        {/* School selector */}
        <div className="mt-4 flex flex-col gap-1.5">
          <SchoolSelector schools={schools} value={school} onChange={setSchool} error={errors.school} />
          {schoolsLoading && <p className="text-xs text-[var(--muted)]">Loading schools...</p>}
          {schoolsError && <p className="text-xs text-warn">{schoolsError}</p>}
        </div>

        {/* Librarian checkbox (teacher only) */}
        {role === "teacher" && (
          <label className="mt-5 flex items-start gap-3 rounded-xl border border-base bg-surface px-4 py-3.5 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={isLibrarian}
              onChange={(e) => setIsLibrarian(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-semibold">I also manage the school library</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                Adds Library Management to your teacher account so you can approve pickup requests and track borrowed books.
              </span>
            </span>
          </label>
        )}

        {/* Terms */}
        <label className="mt-5 flex items-start gap-3 rounded-xl border border-base bg-surface px-4 py-3.5 text-sm text-[var(--text)]">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            I agree to the{" "}
            <a href="/terms" className="font-semibold text-[var(--accent)] underline underline-offset-2">
              Terms and Conditions
            </a>{" "}
            and{" "}
            <a href="/privacy" className="font-semibold text-[var(--accent)] underline underline-offset-2">
              Privacy Policy
            </a>
            .
          </span>
        </label>
        {errors.terms && <p className="mt-1 text-xs text-warn">{errors.terms}</p>}

        {/* Create Account */}
        <button
          type="submit"
          disabled={isLoading}
          className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-navy text-[15px] font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 touch-manipulation"
        >
          {isLoading ? "Creating account..." : "Create Account"}
        </button>

        {/* Log In link */}
        <div className="mt-6 mb-2 flex flex-col gap-1 text-center">
          <p className="text-sm text-[var(--muted)]">Already have an account?</p>
          <Link
            replace
            href="/login"
            className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-base bg-surface text-sm font-bold uppercase tracking-widest text-navy transition hover:border-accent-soft active:scale-[0.98] touch-manipulation"
          >
            Log In
          </Link>
        </div>
      </form>
    </NativeAuthShell>
  );
}