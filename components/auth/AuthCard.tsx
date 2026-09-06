import { LogoLockup } from "./LogoLockup";
import { APP_VERSION } from "@/lib/version";
import { BetaBadge } from "@/components/ui/BetaBadge";

/**
 * Auth card shell used by every auth surface (landing section, login, signup,
 * forgot, reset). It fades/scales in on mount, bobs gently, carries a slow
 * rotating conic hairline border, and sits over a soft ambient glow. In dark
 * mode the surface gets the deep gradient from the design; in light mode it
 * falls back to the clean flat token surface. A slim footer line shows the
 * realtime/secure badge and the app version.
 */
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {/* Ambient glow behind the card */}
      <div
        className="pointer-events-none absolute -inset-8 rounded-[40px]"
        style={{
          background:
            "radial-gradient(circle at 50% 40%, rgba(158,167,179,0.16), transparent 70%)",
          filter: "blur(30px)",
          animation: "orbDrift 11s ease-in-out infinite",
        }}
        aria-hidden
      />

      <div className="hc-card-wrap w-full max-w-[410px]">
        <div className="animate-card-in relative overflow-hidden rounded-[17px] border border-base bg-surface p-8 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] transition-shadow duration-500 hover:shadow-[0_30px_90px_-18px_rgba(0,0,0,0.85),0_0_0_1px_rgba(158,167,179,0.14)]">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(48,47,51,0.55), rgba(15,15,17,0.5))",
            }}
          />
          <div className="relative">
            <div className="mb-6">
              <LogoLockup />
            </div>
            <div className="mb-6 h-px w-full bg-[var(--border)]" />
            {children}
            <div className="mt-7 flex items-center justify-center gap-2 border-t border-[var(--border)] pt-4">
              <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-accent-token/80" />
              <span className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--faint)]">
                Realtime &middot; Secure &middot; v{APP_VERSION} <BetaBadge />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
