"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StudentAchievementRow } from "@/types/supabase";
import { useMyProfile } from "@/lib/useMyProfile";
import { useAchievements, type CreateAchievementInput, type AchievementProfile } from "@/lib/useAchievements";
import { CornerFrame } from "@/components/ui/CornerFrame";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Music } from "@/components/profile/Music";
import { HistoryTimeline } from "@/components/profile/HistoryTimeline";
import { IconTrash, IconEye, IconPlus, IconMinus, IconX, IconCalendar, IconClock, IconSchool } from "@/components/ui/icons";

/** Initial grid page size: 3 columns x 3 rows = 9 cards. */
const GRID_PAGE = 9;

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

const INPUT_CLASS =
  "w-full rounded-[10px] border border-base bg-surface px-3 py-2 text-sm text-navy outline-none focus:border-accent";

function SparkDivider() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-px flex-1 bg-[var(--line)]" />
      <span aria-hidden className="text-[10px] text-accent-token">✦</span>
      <span className="h-px flex-1 bg-[var(--line)]" />
    </div>
  );
}

/**
 * Compact tile for the 3 x 3 profile grid: a title-only collection of
 * achievements. The full title wraps naturally (never truncated); clicking
 * the tile opens the Achievement Detail, which holds all the metadata and the
 * VIEW RAW IMAGE action.
 */
function AchievementCard({ achievement: a, onOpen }: { achievement: StudentAchievementRow; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="View achievement"
      aria-label="View achievement"
      className="group flex flex-col rounded-[10px] border border-base bg-surface p-3.5 text-left transition hover:border-accent-soft"
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="text-[10px] text-accent-token">✦</span>
        <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-muted">Achievement</span>
      </span>
      {/* Full title - wraps naturally, never clamped or ellipsized. */}
      <span className="mt-2 text-sm font-bold leading-snug text-navy">{a.title}</span>
    </button>
  );
}

/** Full premium certificate view, opened from a grid card. */
function AchievementDetail({
  achievement: a,
  isOwner,
  confirmingDelete,
  onViewRaw,
  onRequestDelete,
  onCancelDelete,
  onDelete,
}: {
  achievement: StudentAchievementRow;
  isOwner: boolean;
  confirmingDelete: boolean;
  onViewRaw: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-[13px] text-accent-token">✦</span>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">Achievement</h3>
        </div>
        {isOwner &&
          (confirmingDelete ? (
            <div className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant="danger" onClick={onDelete}>
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancelDelete}>
                Cancel
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onRequestDelete}
              title="Delete achievement"
              aria-label="Delete achievement"
              className="shrink-0 text-muted transition hover:text-warn"
            >
              <IconTrash size={14} />
            </button>
          ))}
      </div>

      <SparkDivider />

      {/* Full title, wraps naturally */}
      <h4 className="mt-5 text-xl font-bold leading-snug text-navy">{a.title}</h4>

      {/* Prominent raw-image action */}
      <button
        type="button"
        onClick={onViewRaw}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-[10px] border border-base bg-[var(--surface-strong)] py-3 text-xs font-bold uppercase tracking-[0.2em] text-navy transition hover:border-accent-soft hover:text-accent-token"
      >
        <IconEye size={14} />
        View Raw Image
      </button>

      <SparkDivider />

      {/* Metadata: icon + label + value */}
      <div className="mt-5 space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-base bg-tile text-muted">
            <IconCalendar size={14} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">School Year</p>
            <p className="mt-1 break-words text-sm font-semibold text-navy">{a.school_year}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-base bg-tile text-muted">
            <IconClock size={14} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Date Awarded</p>
            <p className="mt-1 break-words text-sm font-semibold text-navy">{formatDate(a.date_awarded)}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-base bg-tile text-muted">
            <IconSchool size={14} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">School</p>
            <p className="mt-1 break-words text-sm font-semibold text-navy">{a.school}</p>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Tabbed Achievements / Music / Photos section for the student profile. On
 * the owner's profile it lives inside the profile card (below the rank card)
 * and includes the owner-only "Post Achievement" action at the top of the
 * Achievements tab; on other students' profiles (`studentId` + `viewer`) it
 * is read-only with no Post action. Music is functional (post by link);
 * Photos remains a UI placeholder.
 *
 * Achievements render as a compact 3 x 3 grid (9 initial, "Load More" for
 * more); each card opens the full premium detail view in a Modal.
 */
export function Achievements({ studentId, viewer = false, historyPrivate = false }: { studentId?: string; viewer?: boolean; historyPrivate?: boolean }) {
  const { profile } = useMyProfile();
  const targetId = studentId ?? profile?.id;
  const { achievements, loading, error, create, remove } = useAchievements(targetId);
  const isOwner = !viewer;

  const [tab, setTab] = useState<"achievements" | "music" | "photos" | "history">("achievements");
  const [postOpen, setPostOpen] = useState(false);
  const [details, setDetails] = useState<StudentAchievementRow | null>(null);
  const [viewing, setViewing] = useState<StudentAchievementRow | null>(null);
  const [zoom, setZoom] = useState(1);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(GRID_PAGE);

  const visible = achievements.slice(0, visibleCount);

  // Escape closes the full-screen raw image viewer and returns to the detail view.
  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);

  function resetViewer() {
    setViewing(null);
    setZoom(1);
  }

  async function handleDelete(a: StudentAchievementRow) {
    await remove(a);
    setConfirmingDelete(null);
    setDetails(null);
  }

  const TABS = [
    { key: "achievements" as const, label: "Achievements" },
    { key: "music" as const, label: "Music" },
    { key: "photos" as const, label: "Photos" },
    ...(historyPrivate ? [] : [{ key: "history" as const, label: "History" }]),
  ];

  return (
    <CornerFrame className="rounded-[10px] border border-base bg-surface p-5">
      {/* Profile-section tabs - a compact social-profile navigation strip
          (Facebook-style UX, not the visual). Text-only tabs with a accent
          bottom indicator on the active one; muted text when inactive. No
          heavy borders, no oversized segmented buttons. On very narrow
          screens ONLY this strip scrolls horizontally - never the page. */}
      <div className="mb-5 -mx-5 flex items-stretch gap-1 overflow-x-auto border-b border-base px-5 pb-0 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap px-3 text-sm font-semibold transition sm:px-4 ${
                active ? "text-navy" : "text-muted hover:text-navy"
              }`}
            >
              {t.label}
              {active && (
                <span
                  aria-hidden
                  className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-accent-token"
                />
              )}
            </button>
          );
        })}
      </div>

      {tab === "music" && <Music studentId={targetId} viewer={viewer} />}
      {tab === "photos" && (
        <p className="py-10 text-center text-sm text-muted">Photos aren&apos;t available yet.</p>
      )}

      {tab === "history" && (
        <HistoryTimeline studentId={targetId} viewer={viewer} />
      )}
      {tab === "achievements" && (
        <>
          {isOwner && profile && (
            <div className="mb-4">
              <Button variant="accent" className="w-full" icon={<IconPlus size={15} />} onClick={() => setPostOpen(true)}>
                Post Achievement
              </Button>
            </div>
          )}
          {loading ? (
            <p className="text-sm text-muted">Loading achievements...</p>
          ) : error ? (
            <p className="text-sm text-warn">{error}</p>
          ) : achievements.length === 0 ? (
            <p className="text-sm text-muted">
              {isOwner ? "No achievements yet - share your first one." : "No achievements yet."}
            </p>
          ) : (
            <>
              {/* Compact grid: 3 columns desktop, 2 tablet, 1 mobile. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((a) => (
                  <AchievementCard key={a.id} achievement={a} onOpen={() => setDetails(a)} />
                ))}
              </div>
              {achievements.length > visibleCount && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + GRID_PAGE)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-[10px] border border-base bg-surface py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-navy transition hover:border-accent-soft"
                >
                  Load More
                </button>
              )}
            </>
          )}
        </>
      )}

      {postOpen && isOwner && profile && (
        <PostAchievementModal
          profile={{ id: profile.id, school_id: profile.school_id }}
          create={create}
          onClose={() => setPostOpen(false)}
        />
      )}

      {details && (
        <Modal onClose={() => setDetails(null)} eyebrow="Achievement" description="Certificate record">
          <div className="mt-3">
            <AchievementDetail
              achievement={details}
              isOwner={isOwner}
              confirmingDelete={confirmingDelete === details.id}
              onViewRaw={() => setViewing(details)}
              onRequestDelete={() => setConfirmingDelete(details.id)}
              onCancelDelete={() => setConfirmingDelete(null)}
              onDelete={() => handleDelete(details)}
            />
          </div>
        </Modal>
      )}

      {viewing &&
        createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={viewing.title}
          onClick={resetViewer}
          className="fixed inset-0 z-[70] flex flex-col bg-black/90"
        >
          {/* Top bar: title + zoom controls + close. */}
          <div
            className="flex items-center justify-between gap-3 px-4 py-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="min-w-0 truncate text-sm font-medium text-white/80">{viewing.title}</p>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
                title="Zoom out"
                aria-label="Zoom out"
                className="flex h-9 w-9 items-center justify-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                <IconMinus size={16} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                title="Reset zoom"
                aria-label="Reset zoom"
                className="flex h-9 items-center justify-center rounded-md px-2 text-[11px] font-semibold uppercase tracking-wider text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                {zoom.toFixed(1)}x
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, z + 0.5))}
                title="Zoom in"
                aria-label="Zoom in"
                className="flex h-9 w-9 items-center justify-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                <IconPlus size={16} />
              </button>
              <button
                type="button"
                onClick={resetViewer}
                title="Close"
                aria-label="Close"
                className="ml-1 flex h-9 w-9 items-center justify-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                <IconX size={18} />
              </button>
            </div>
          </div>

          {/* Certificate fills the available viewport, object-contain, centered. */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
            <img
              src={viewing.image_path}
              alt={viewing.title}
              className="max-h-full max-w-full object-contain"
              style={{ transform: `scale(${zoom})`, transition: "transform 150ms ease" }}
            />
          </div>
        </div>,
        document.body
      )}
    </CornerFrame>
  );
}

/**
 * Post Achievement form - owner-only action inside the Achievements tab. On
 * submit it uploads the certificate and inserts the row via the Achievements
 * section's own `create` (so the list refreshes on its hook's refetch), then
 * closes. Reuses the shared upload validation and the avatar-style
 * owner-folder storage pattern.
 */
export function PostAchievementModal({
  profile,
  create,
  onClose,
}: {
  profile: AchievementProfile;
  create: (input: CreateAchievementInput, profile: AchievementProfile) => Promise<{ error: string | null }>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [schoolYear, setSchoolYear] = useState("");
  const [dateAwarded, setDateAwarded] = useState("");
  const [school, setSchool] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!image) {
      setError("Certificate image is required.");
      return;
    }
    if (!title.trim() || !schoolYear.trim() || !dateAwarded || !school.trim()) {
      setError("All fields are required.");
      return;
    }
    setSubmitting(true);
    const input: CreateAchievementInput = { title, school_year: schoolYear, date_awarded: dateAwarded, school, image };
    const { error: err } = await create(input, profile);
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  }

  return (
    <Modal eyebrow="Achievements" description="Post a raw certificate and its details to your profile" onClose={onClose}>
      <h2 className="mt-3 text-xl font-bold text-navy">Post Achievement</h2>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <Field label="Achievement Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="School Year">
          <input
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            placeholder="Year"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Date Awarded">
          <input
            type="date"
            value={dateAwarded}
            onChange={(e) => setDateAwarded(e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="School">
          <input
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            placeholder="School Name"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Certificate / Raw Image">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => setImage(e.target.files?.[0] ?? null)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-dashed border-base bg-surface px-3 py-2.5 text-sm text-muted transition hover:border-accent"
          >
            <span className="truncate">{image ? image.name : "Choose certificate image"}</span>
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-navy">
              {image ? "Change" : "Browse"}
            </span>
          </button>
        </Field>
        {error && <p className="text-sm text-warn">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" variant="accent" className="flex-1" loading={submitting} disabled={submitting}>
            {submitting ? "Posting..." : "Post achievement"}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
