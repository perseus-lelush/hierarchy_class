/**
 * Circle loading indicators (#6): one classic spinner used everywhere on web
 * and Android - route loaders (PageLoader) and in-page states (InlineLoader).
 */
export function Spinner({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-line border-t-sealion ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Centered circle + optional label, for in-page loading states. */
export function InlineLoader({
  label,
  className = "py-8",
  size = 24,
}: {
  label?: string;
  className?: string;
  size?: number;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <Spinner size={size} />
      {label && <p className="text-sm text-muted">{label}</p>}
    </div>
  );
}
