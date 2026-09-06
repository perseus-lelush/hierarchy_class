/**
 * Small "BETA" chip shown next to the app name / version strings during the
 * beta program (#11): settings footers, the auth card, and the landing page.
 * The PWA manifest and Android launcher labels also carry "(Beta)".
 */
export function BetaBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Hierarchy Class is in beta - features may change"
      className={`inline-flex items-center rounded-full border border-accent-soft bg-accent-soft px-2 py-0.5 align-middle font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-accent-token ${className}`}
    >
      Beta
    </span>
  );
}
