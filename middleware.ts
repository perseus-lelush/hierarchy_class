import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database, Role } from "@/types/supabase";
import { decideAuthRoute, type AuthProfile } from "@/lib/authz";

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

// Runs on (almost) every request. Three jobs:
// 1. Keep the Supabase session cookie fresh (required by @supabase/ssr).
// 2. Enforce that /student, /teacher, /admin are only reachable by a logged
//    in user whose PROFILES row matches - role and school come from the
//    database (profiles.role / profiles.school_id), never from
//    auth.users.user_metadata (which the user can edit themselves).
//    Also enforces email confirmation and the deactivated-account lifecycle.
// 3. Issue a per-request nonce and the Content-Security-Policy that uses it.
//    The nonce travels on the request headers (x-nonce + the CSP header,
//    which Next.js parses to nonce its own inline scripts) and the policy is
//    echoed on the response. See app/layout.tsx for the one script that
//    consumes x-nonce explicitly.
const isProduction = process.env.NODE_ENV === "production";

function contentSecurityPolicy(nonce: string): string {
  // Production: no 'unsafe-inline' / 'unsafe-eval' for scripts - inline code
  // is only allowed with the per-request nonce, and 'strict-dynamic' lets the
  // nonce'd Next.js runtime load its code-split chunks. Dev keeps the flags
  // React refresh / HMR need (a browser ignores 'unsafe-inline' when a nonce
  // is present, so dev simply drops the nonce).
  const scriptSrc = isProduction
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    scriptSrc,
    // 'unsafe-inline' stays for styles: React renders style attributes and
    // Tailwind's runtime output depends on it.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com https://api.paymongo.com https://openlibrary.org",
    "frame-src https://www.youtube.com https://player.vimeo.com https://open.spotify.com https://w.soundcloud.com https://accounts.spotify.com",
    "worker-src 'self' blob:",
  ].join("; ");
}

// The standalone Android (Capacitor) bundle runs on https://localhost and
// calls the bridge API cross-origin. JSON POSTs trigger a CORS preflight,
// which used to fail (no ACAO header) and made EVERY bridge call from the
// app report "offline" even on full internet. These headers fix it - the
// origin allowlist is only the app's own bundle origin, and the bridge
// routes authenticate their callers anyway.
const ANDROID_BUNDLE_ORIGIN = "https://localhost";
const BRIDGE_PREFIX = "/api/bridge/";

function corsHeaders(request: NextRequest): HeadersInit {
  const origin = request.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin === ANDROID_BUNDLE_ORIGIN ? ANDROID_BUNDLE_ORIGIN : "",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function middleware(request: NextRequest) {
  // CORS preflight for the Android bridge: answer directly with no auth work.
  if (
    request.method === "OPTIONS" &&
    request.nextUrl.pathname.startsWith(BRIDGE_PREFIX) &&
    request.headers.get("origin") === ANDROID_BUNDLE_ORIGIN
  ) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
  }

  // Per-request nonce (base64 so it is quote-safe inside the CSP header).
  // Set on the request itself so every NextResponse.next() created below -
  // including the one inside the Supabase cookie callback - forwards it.
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request });
  response.headers.set("Content-Security-Policy", csp);

  // Bridge responses always carry the CORS allowance for the Android bundle.
  if (request.nextUrl.pathname.startsWith(BRIDGE_PREFIX) && request.headers.get("origin") === ANDROID_BUNDLE_ORIGIN) {
    Object.entries(corsHeaders(request)).forEach(([k, v]) => response.headers.set(k, String(v)));
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Supabase not configured yet (e.g. still doing UI-only local work) -
  // don't block anything, matches the "fake auth bypass" the rest of the
  // app already falls back to when these env vars are missing.
  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Resolve the caller's profile from the DATABASE (profiles.user_id), not
  // from user_metadata. This single query also covers deactivation.
  // (Note: supabase-js types `.maybeSingle()` as `never` here, so the result
  // is cast - same convention as the rest of the codebase.)
  //
  // A transient DB error must NOT look like "no profile" - that would bounce
  // signed-in users to /auth/incomplete (false logout). On error, fail open
  // for the cookie-refresh job and let each page/API enforce its own auth.
  let profile: AuthProfile | null = null;
  if (user) {
    const { data: profileRow, error: profileError } = (await supabase
      .from("profiles")
      .select("role, school_id, deactivated_at, restricted_at")
      .eq("user_id", user.id)
      .maybeSingle()) as {
      data: { role: string; school_id: string; deactivated_at: string | null; restricted_at: string | null } | null;
      error: { message: string } | null;
    };
    if (profileError) {
      console.error("[middleware] profiles lookup failed:", profileError.message);
      return response;
    }
    if (profileRow) {
      const role = profileRow.role as Role;
      if (role === "student" || role === "teacher" || role === "admin") {
        profile = {
          role,
          school_id: profileRow.school_id,
          deactivated_at: profileRow.deactivated_at,
          restricted_at: profileRow.restricted_at,
        };
      }
    }
  }

  const decision = decideAuthRoute({
    pathname,
    isAuthenticated: !!user,
    emailConfirmed: !!user?.email_confirmed_at,
    profile,
  });

  if (decision.type === "redirect") {
    // Bounce wrong-role users to their own home (their own role's home only
    // exists for known roles - the profile check guarantees that here).
    const redirect = NextResponse.redirect(new URL(decision.to, request.url));
    redirect.headers.set("Content-Security-Policy", csp);
    if (request.nextUrl.pathname.startsWith(BRIDGE_PREFIX) && request.headers.get("origin") === ANDROID_BUNDLE_ORIGIN) {
      Object.entries(corsHeaders(request)).forEach(([k, v]) => redirect.headers.set(k, String(v)));
    }
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|offline|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
