"use client";

/**
 * Full-screen voice call overlay (#4 beta feature). Rendered once in
 * app/layout.tsx so an incoming call can interrupt any page. Audio-only,
 * 1:1 (groups are out of scope for beta).
 */

import { useEffect } from "react";
import { useCallStore } from "@/lib/callStore";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { registerBackHandler as registerBack } from "@/lib/nativeBackHandler";

function formatDuration(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CallOverlay() {
  const { status, peer, muted, durationSec, error, acceptCall, declineCall, endCall, toggleMute, clearEnded } =
    useCallStore();

  // Android hardware back ends/declines the call instead of navigating.
  useEffect(() => {
    if (status === "idle") return;
    return registerBack(() => {
      if (status === "incoming") declineCall();
      else if (status !== "ended") endCall();
      else clearEnded();
      return true;
    });
  }, [status, acceptCall, declineCall, endCall, clearEnded]);

  if (status === "idle" || !peer) return null;

  const ended = status === "ended";

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-[#0f0f11]/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className={status === "calling" || status === "incoming" ? "animate-pulse" : undefined}>
          <UserAvatar name={peer.name} size="2xl" className="border-2 border-[#2a2b2f]" />
        </div>
        <p className="mt-2 font-display text-xl font-bold text-[#f0f0f1]">{peer.name}</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#9ea7b3]">
          {ended
            ? (error ?? "Call ended")
            : status === "calling"
              ? "Ringing…"
              : status === "incoming"
                ? "Incoming voice call"
                : status === "connecting"
                  ? "Connecting…"
                  : formatDuration(durationSec)}
        </p>
      </div>

      <div className="mt-12 flex items-center gap-5">
        {status === "incoming" && !ended && (
          <>
            <CallButton
              label="Decline"
              tone="danger"
              onClick={declineCall}
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>}
            />
            <CallButton
              label="Accept"
              tone="accept"
              onClick={acceptCall}
              icon={<PhoneIcon />}
            />
          </>
        )}

        {(status === "active" || status === "connecting" || status === "calling") && !ended && (
          <>
            <CallButton
              label={muted ? "Unmute" : "Mute"}
              onClick={toggleMute}
              tone={muted ? "danger" : "neutral"}
              icon={
                muted ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3" /></svg>
                )
              }
            />
            <CallButton
              label="End"
              tone="danger"
              onClick={endCall}
              icon={<PhoneOffIcon />}
            />
          </>
        )}

        {ended && (
          <CallButton label="Close" tone="neutral" onClick={clearEnded} icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>} />
        )}
      </div>

      <p className="mt-10 max-w-xs text-center text-[11px] leading-5 text-[#6c6d73]">
        Hierarchy Class beta voice call - audio only, peer-to-peer.
      </p>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
      <path d="m23 1-1-1M22.04 2.96 1.96 23.04" />
      <path d="M16 5v4M20 5v4" />
    </svg>
  );
}

function CallButton({
  label,
  onClick,
  icon,
  tone,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  tone: "accept" | "danger" | "neutral";
}) {
  const tones = {
    accept: "bg-[#9ea7b3] text-[#141214] hover:opacity-90",
    danger: "bg-[#8a5f5f] text-[#f0f0f1] hover:opacity-90",
    neutral: "border border-[#2a2b2f] bg-[#1a1b1e] text-[#f0f0f1] hover:border-[#9ea7b3]",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex flex-col items-center gap-1.5"
    >
      <span className={`flex h-14 w-14 items-center justify-center rounded-full transition active:scale-95 ${tones[tone]}`}>
        {icon}
      </span>
      <span className="text-[11px] font-semibold text-[#9ea7b3]">{label}</span>
    </button>
  );
}
