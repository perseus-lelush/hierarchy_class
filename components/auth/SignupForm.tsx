"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { School } from "@/types/school";
import { useSchools } from "@/lib/useSchools";
import { SchoolSelector } from "./SchoolSelector";
import { signUpWithProfile, resendSignupConfirmation } from "@/lib/bridgeClient";
import {
  validateSignupInput,
  type PublicSignupRole,
  type SignupErrors,
} from "@/lib/signupValidation";

const ROLE_OPTIONS: { value: PublicSignupRole; label: string; hint: string }[] = [
  { value: "student", label: "Student", hint: "I'm enrolling at this school" },
  { value: "teacher", label: "Teacher", hint: "I teach at this school" },
];

type Mode = "form" | "checkEmail";

export function SignupForm() {
  const router = useRouter();
  const { schools, loading: schoolsLoading, error: schoolsError } = useSchools();
  const [mode, setMode] = useState<Mode>("form");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        // UI-only fallback (no Supabase wired up): simulate the flow so the
        // click-through stays testable.
        await new Promise((resolve) => setTimeout(resolve, 700));
        router.push("/student/home");
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

      // Confirmation email sent - show the verification state (never assume
      // confirmation succeeded).
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
      <div className="animate-pop-in flex w-full flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path className="draw-check" d="M22 7l-10 6L2 7" />
          </svg>
        </span>
        <h2 className="text-lg font-bold text-navy">Check your email</h2>
        <p className="text-sm leading-6 text-muted">
          We&apos;ve sent a confirmation link to <span className="font-semibold text-navy">{email}</span>.
          Confirm your email before logging in.
        </p>
        {resendStatus && (
          <p className={`text-xs ${resendStatus.startsWith("A new") ? "text-accent-token" : "text-warn"}`}>
            {resendStatus}
          </p>
        )}
        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            disabled={resending}
            onClick={handleResend}
            className="rounded-lg bg-navy py-3 text-sm font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {resending ? "Sending..." : "Resend confirmation email"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="rounded-lg border border-base py-3 text-sm font-semibold text-navy transition hover:border-accent-soft"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-5">
      {formError && (
        <div className="animate-shake rounded-lg border border-warn-soft bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
          {formError}
        </div>
      )}

      {/* Account type: Student / Teacher only. Administrators are provisioned
          by the platform owner and never appear here. */}
      <div className="grid gap-2 sm:grid-cols-2">
        {ROLE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setRole(option.value)}
            className={`rounded-[10px] border px-3.5 py-3 text-left transition ${
              role === option.value
                ? "border-accent-token bg-[var(--surface-strong)]"
                : "border-base bg-surface hover:border-accent-soft"
            }`}
          >
            <span className={`block text-sm font-bold ${role === option.value ? "text-navy" : "text-muted"}`}>
              {option.label}
            </span>
            <span className="mt-0.5 block text-[11px] text-faint">{option.hint}</span>
          </button>
        ))}
      </div>
      {errors.role && <p className="-mt-2 text-xs text-warn">{errors.role}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-navy">
            First name
          </label>
          <input
            id="signup-first-name"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Jane"
            disabled={isLoading}
            autoComplete="given-name"
            className={`rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-all disabled:bg-tile disabled:text-faint
              ${errors.firstName ? "border-warn-soft" : "border-base focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(158,167,179,0.18)]"}`}
          />
          {errors.firstName && <p className="text-xs text-warn">{errors.firstName}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-navy">
            Last name
          </label>
          <input
            id="signup-last-name"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Doe"
            disabled={isLoading}
            autoComplete="family-name"
            className={`rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-all disabled:bg-tile disabled:text-faint
              ${errors.lastName ? "border-warn-soft" : "border-base focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(158,167,179,0.18)]"}`}
          />
          {errors.lastName && <p className="text-xs text-warn">{errors.lastName}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-navy">
          Middle name <span className="font-normal normal-case text-faint">(optional)</span>
        </label>
        <input
          id="signup-middle-name"
          type="text"
          value={middleName}
          onChange={(e) => setMiddleName(e.target.value)}
          placeholder="Marie"
          disabled={isLoading}
          autoComplete="additional-name"
          className="rounded-lg border border-base px-3.5 py-2.5 text-sm outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(158,167,179,0.18)] disabled:bg-tile disabled:text-faint"
        />
      </div>

      {role === "student" ? (
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-navy">
            Student ID
          </label>
          <input
            id="signup-student-id"
            type="text"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder="Your school-issued ID (e.g. 2024-1001)"
            disabled={isLoading}
            autoComplete="off"
            className={`rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-all disabled:bg-tile disabled:text-faint
              ${errors.studentId ? "border-warn-soft" : "border-base focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(158,167,179,0.18)]"}`}
          />
          {errors.studentId && <p className="text-xs text-warn">{errors.studentId}</p>}
          <p className="text-[11px] text-faint">The ID your school issued to you - not a password, and never shared.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-navy">
            Faculty ID
          </label>
          <input
            id="signup-faculty-id"
            type="text"
            value={facultyId}
            onChange={(e) => setFacultyId(e.target.value)}
            placeholder="Your school-issued faculty ID"
            disabled={isLoading}
            autoComplete="off"
            className={`rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-all disabled:bg-tile disabled:text-faint
              ${errors.facultyId ? "border-warn-soft" : "border-base focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(158,167,179,0.18)]"}`}
          />
          {errors.facultyId && <p className="text-xs text-warn">{errors.facultyId}</p>}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-navy">
          Email
        </label>
        <input
          id="signup-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={isLoading}
          autoComplete="email"
          className={`rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-all disabled:bg-tile disabled:text-faint
            ${errors.email ? "border-warn-soft" : "border-base focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(158,167,179,0.18)]"}`}
        />
        {errors.email && <p className="text-xs text-warn">{errors.email}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-navy">
          Password
        </label>
        <input
          id="signup-password"
          type="password"
          maxLength={72}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters, with a letter and a number"
          disabled={isLoading}
          autoComplete="new-password"
          className={`rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-all disabled:bg-tile disabled:text-faint
            ${errors.password ? "border-warn-soft" : "border-base focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(158,167,179,0.18)]"}`}
        />
        {errors.password && <p className="text-xs text-warn">{errors.password}</p>}
      </div>

      <div className="grid gap-5 sm:grid-cols-1">
        <div className="flex flex-col gap-1.5">
          <SchoolSelector schools={schools} value={school} onChange={setSchool} error={errors.school} />
          {schoolsLoading && <p className="text-xs text-muted">Loading schools...</p>}
          {schoolsError && <p className="text-xs text-warn">{schoolsError}</p>}
        </div>
      </div>

      {role === "teacher" && (
        <label className="flex items-start gap-2.5 rounded-lg border border-base px-3.5 py-3 text-sm text-navy">
          <input
            type="checkbox"
            checked={isLibrarian}
            onChange={(e) => setIsLibrarian(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-semibold">I also manage the school library</span>
            <span className="mt-0.5 block text-xs text-muted">
              Adds Library Management to your teacher account so you can approve pickup requests and track borrowed books.
            </span>
          </span>
        </label>
      )}

      <label className="flex items-start gap-2.5 rounded-lg border border-base px-3.5 py-3 text-sm text-[var(--text)]">
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
      {errors.terms && <p className="-mt-2 text-xs text-warn">{errors.terms}</p>}

      <button
        type="submit"
        disabled={isLoading}
        className="group relative mt-1 flex items-center justify-center overflow-hidden rounded-lg bg-navy py-3 text-sm font-bold uppercase tracking-widest text-white transition-opacity disabled:opacity-90"
      >
        {isLoading && (
          <span className="absolute inset-y-0 left-0 w-full origin-left animate-fillbar bg-accent/90" />
        )}
        <span className="relative flex items-center gap-2 justify-center">
          {isLoading ? "Creating account" : "Create account"}
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
        />
      </button>

      <p className="text-center text-xs text-muted">
        Already registered? <a href="/login" className="font-semibold text-navy hover:underline">Log in</a>.
      </p>
    </form>
  );
}
