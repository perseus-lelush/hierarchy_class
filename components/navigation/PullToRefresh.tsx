"use client";

/**
 * Mobile pull-to-refresh (#3 beta fix).
 *
 * Wraps a page (or any scroll region) and re-fetches its stores when the
 * user drags down at the very top of the scroll position on touch devices.
 * Because the app's data lives in React stores (chat, friends, rank, feed...)
 * "refresh" simply calls the stores' refetch functions - no full page
 * reload, which would be slow and would break offline caching.
 *
 * Usage:
 *   <PullToRefresh className="h-full">
 *     <PageContent />
 *   </PullToRefresh>
 *
 * The component is inert on desktop (no touch drag) and while an expanded
 * overlay (modal etc.) consumes the gesture - the threshold only triggers
 * when scrollTop === 0 so inner scrolling is never hijacked.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useChatStore } from "@/lib/chatStore";
import { useFriendsStore } from "@/lib/friendsStore";
import { useRankStore } from "@/lib/rankStore";

const THRESHOLD = 72;
const MAX_PULL = 110;

export function PullToRefresh({
  children,
  className = "",
  disabled = false,
}: {
  children: ReactNode;
  className?: string;
  /** Pages with a modal/open overlay pass disabled to suppress the gesture. */
  disabled?: boolean;
}) {
  const { refetch: chatRefetch } = useChatStore();
  const { refetch: friendsRefetch } = useFriendsStore();
  const { refetch: rankRefetch } = useRankStore();

  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);

  // Guard: keep only one refresh in flight and ignore desktop (no touch).
  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled || refreshing || e.touches.length !== 1) return;
    const scroller = e.currentTarget;
    if (scroller.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!pulling.current || startY.current === null) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) {
      setPull(0);
      return;
    }
    // Rubber-band: increasing resistance as the pull grows.
    setPull(Math.min(MAX_PULL, delta * 0.55));
  };

  const onTouchEnd = () => {
    pulling.current = false;
    startY.current = null;
    if (pull >= THRESHOLD) {
      setPull(0);
      setRefreshing(true);
      // Store refetches are synchronous triggers; give them a beat so the
      // spinner is visible and in-flight requests settle.
      chatRefetch();
      friendsRefetch();
      rankRefetch();
      setTimeout(() => setRefreshing(false), 900);
    } else {
      setPull(0);
    }
  };

  const show = refreshing || pull > 0;

  return (
    <div
      className={`relative ${className}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* Indicator floats above the content while pulling. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-2 z-40 flex justify-center transition-transform duration-150"
        style={{
          transform: show ? "translateY(0)" : "translateY(-48px)",
          opacity: show ? (pull > 0 ? Math.min(1, pull / THRESHOLD) : 1) : 0,
        }}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-base bg-surface shadow-sm">
          {refreshing ? (
            <svg className="h-4 w-4 animate-spin text-accent-token" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg
              className="text-accent-token"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: `rotate(${Math.min(180, (pull / THRESHOLD) * 180)}deg)` }}
              aria-hidden
            >
              <path d="M12 3v14" />
              <path d="m6 11 6 6 6-6" />
            </svg>
          )}
        </span>
      </div>
      {children}
    </div>
  );
}
