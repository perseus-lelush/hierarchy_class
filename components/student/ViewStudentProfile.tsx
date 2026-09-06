"use client";

/**
 * Shared "view another person's profile" screen.
 *
 * Mounted by two routes:
 *   - /student/profile/view?id=<id>  (web + standalone Android app; the
 *     statically exported Android bundle cannot serve dynamic path segments)
 *   - /student/profile/[id]          (web deep links; server-rendered on demand)
 *
 * Originally the [id] page body; extracted so both routes share it.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMyProfile } from "@/lib/useMyProfile";
import { useFriendsStore } from "@/lib/friendsStore";
import { useAcademicIdentity } from "@/lib/useAcademicIdentity";
import { useRankStore } from "@/lib/rankStore";
import { useSchoolEnrollments, effectiveFrom } from "@/lib/useEnrollment";
import { useClassroomHierarchy } from "@/lib/classroomHierarchyStore";
import { useShop } from "@/lib/shopStore";
import { useSchools } from "@/lib/useSchools";
import { EnrolledBadge } from "@/components/ui/EnrolledBadge";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { createClient } from "@/lib/supabase/client";
import { randomId } from "@/lib/randomId";
import { RankBadge } from "@/components/ui/RankBadge";
import { CornerFrame } from "@/components/ui/CornerFrame";
import { StatRadarChart } from "@/components/profile/StatRadarChart";
import { Achievements } from "@/components/profile/Achievements";
import { FriendActionButton } from "@/components/profile/FriendActionButton";
import { IconArchive, IconEye, IconLock } from "@/components/ui/icons";
import type { ProfileRow } from "@/types/supabase";
import { InlineLoader } from "@/components/ui/Loading";

export function ViewStudentProfile({ profileId }: { profileId: string }) {
  const router = useRouter();
  const { profile: me, loading: meLoading } = useMyProfile();
  const { rankOf } = useRankStore();
  const { getCoursesByTeacher, getStudentAverageByProfile } = useClassroomHierarchy();
  const { schools } = useSchools();
  const { friendIds } = useFriendsStore();
  const identity = useAcademicIdentity(profileId);
  const { statuses } = useSchoolEnrollments();
  const { profileCardOf } = useShop();

  const [person, setPerson] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchTick, setRefetchTick] = useState(0);

  useEffect(() => {
    if (meLoading) return;
    if (me && me.id === profileId) {
      router.replace("/student/profile");
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("*")
      .eq("id", profileId)
      .single()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError || !data) {
          setError("Couldn't find that person.");
        } else {
          setPerson(data as ProfileRow);
        }
        setLoading(false);
      });
    // Live profile: an admin editing this student's academic info (or the
    // student changing their avatar/bio) updates the open profile instantly.
    const channel = supabase
      .channel(`view-profile-${randomId()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => {
          if (!cancelled) setRefetchTick((t) => t + 1);
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [profileId, me, meLoading, router, refetchTick]);

  if (loading || meLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <InlineLoader label="Loading profile..." />
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <p className="text-sm text-warn">{error ?? "Profile not found."}</p>
      </div>
    );
  }

  // Deactivated accounts don't render a normal personal profile - only a
  // neutral "deactivated" state. Historical school records are untouched.
  if (person.deactivated_at) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="w-full max-w-md">
          <CornerFrame className="rounded-[10px] border border-base bg-surface p-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-base bg-tile text-muted">
              <IconArchive size={20} />
            </span>
            <h1 className="mt-4 text-lg font-bold text-navy">This account is deactivated</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              This profile is temporarily unavailable. The account holder can reactivate it when they return.
            </p>
          </CornerFrame>
        </div>
      </div>
    );
  }

  const isStudent = person.role === "student";
  const isFriend = friendIds.includes(person.id);
  const viewerIsStaff = me?.role === "teacher" || me?.role === "admin";
  const isSelf = me?.id === person.id;
  // Private profile: other students see a limited card; friends, the owner,
  // and school staff always see everything (#9).
  const limitedView = isStudent && !!person.profile_private && !isFriend && !viewerIsStaff && !isSelf;
  // Private history: students can't open a private history tab; staff can.
  const historyHidden = isStudent && !!person.history_private && !viewerIsStaff && !isSelf;

  const coursesTaught = isStudent ? [] : getCoursesByTeacher(person.id);
  const avg = getStudentAverageByProfile(person.id) ?? 0;
  const viewedRank = isStudent ? rankOf(person.id) : null;
  const rank = viewedRank?.current_rank ?? "D";
  const rankBar = viewedRank && viewedRank.current_rank !== "EX" ? viewedRank.current_bar : null;
  const rankExScore = viewedRank?.current_rank === "EX" ? viewedRank.ex_score : null;
  const identityLine = [person.educational_level, person.program ?? identity.programNames.join(" · "), person.level_label]
    .filter(Boolean)
    .join(" · ");
  const enrollment = statuses[person.id]
    ? effectiveFrom({
        status: statuses[person.id].status,
        expires_at: statuses[person.id].expiresAt,
      } as any)
    : "unknown";
  const personId = person.id;
  const cardBg = profileCardOf(personId);

  // Message routes through the VIEWER's own messenger (#8): a student viewer
  // targets /student/messages, staff their own role's messenger.
  function handleMessage() {
    router.push(`/${me?.role ?? "student"}/messages?with=${personId}`);
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-2xl space-y-6">
      <CornerFrame className="overflow-hidden rounded-[10px] border border-base bg-surface">
        {/* Cover strip: the person's equipped profile-card background when
            they own one, otherwise the flat decorative token strip. */}
        <div
          className="relative h-24 bg-cover bg-center"
          style={cardBg ? { backgroundImage: `url(${cardBg})` } : undefined}
        >
          {!cardBg && <div className="absolute inset-0 bg-asphalt/50" />}
          {cardBg && <div className="cover-tint absolute inset-0" />}
          <div className="absolute right-6 top-5 h-8 w-8 rounded-lg border border-line bg-tile/40" />
          <div className="absolute bottom-4 left-10 h-4 w-16 rounded-full border border-line bg-tile/30" />
        </div>

        <div className="px-5 pb-6 max-sm:px-4">
          <div className="-mt-12 flex flex-col items-center text-center">
            <UserAvatar
              name={person.full_name}
              src={person.avatar_url}
              size="2xl"
              className="border-2 border-surface"
              profileId={person.id}
            />
            <div className="mt-3 flex w-full flex-col items-center">
              <div className="flex max-w-full flex-wrap items-center justify-center gap-2">
                <h1 className="break-words text-xl font-bold text-navy sm:text-2xl">{person.full_name}</h1>
                {isStudent && <EnrolledBadge status={enrollment} size="sm" />}
              </div>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-accent">
                {isStudent ? "Student" : "Faculty"}
              </p>
              {!limitedView && isStudent && identityLine && (
                <p className="mt-1.5 text-sm text-muted">{identityLine}</p>
              )}
              {!limitedView && isStudent && person.favorite_subject && (
                <p className="mt-1.5 text-[12.5px] text-muted">
                  <span className="font-semibold text-accent-token">Favorite subject:</span>{" "}
                  {person.favorite_subject}
                </p>
              )}
            </div>

            {isStudent && (
              <div className="mt-4">
                <RankBadge rank={rank} size="lg" bar={rankBar} exScore={rankExScore} />
              </div>
            )}

            {!limitedView && person.bio && (
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted">{person.bio}</p>
            )}
            {!limitedView && Array.isArray(person.hobbies) && person.hobbies.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {person.hobbies.map((h) => (
                  <span key={h} className="rounded-full border border-line bg-tile px-2.5 py-0.5 text-[11px] text-muted">
                    {h}
                  </span>
                ))}
              </div>
            )}
          </div>

          {limitedView ? (
            <div className="mt-6 flex flex-col items-center gap-2 rounded-[10px] border border-base bg-[var(--surface-strong)] px-4 py-6 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent-token">
                <IconLock size={18} />
              </span>
              <p className="text-sm font-semibold text-navy">This profile is private</p>
              <p className="max-w-xs text-xs text-muted">
                {person.full_name.split(" ")[0]} keeps their profile details private. Add them as a friend to see more.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {isStudent && (
                <FriendActionButton
                  targetId={personId}
                  targetName={person.full_name}
                  isFriend={isFriend}
                />
              )}
              <button
                type="button"
                onClick={handleMessage}
                className="rounded-full bg-navy px-4 py-2.5 text-sm font-semibold text-white transition hover-bg-accent-token hover-text-on-accent"
              >
                Message
              </button>
            </div>
          )}

          {!limitedView && !isStudent && (
            <div className="mt-6 border-t border-base pt-5 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-faint">About</p>
              <div className="mt-3 space-y-2.5 text-sm">
                {person.favorite_subject && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted">Favorite subject</span>
                    <span className="font-medium text-navy">{person.favorite_subject}</span>
                  </div>
                )}
                {schools[0]?.name && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted">School</span>
                    <span className="font-medium text-navy">{schools[0].name}</span>
                  </div>
                )}
                {coursesTaught.length > 0 && (
                  <div className="pt-1">
                    <p className="mb-2 text-muted">Teaching</p>
                    <div className="flex flex-wrap gap-2">
                      {coursesTaught.map((course) => (
                        <span
                          key={course.id}
                          className="rounded-full border border-line bg-tile px-2.5 py-0.5 text-[11px] text-navy"
                        >
                          {course.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {limitedView && (
            <div className="mt-4 flex justify-center">
              <FriendActionButton
                targetId={personId}
                targetName={person.full_name}
                isFriend={isFriend}
                className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-on-accent transition hover:opacity-90"
              />
            </div>
          )}
        </div>
      </CornerFrame>

      {isStudent && !limitedView && (
        <>
          <CornerFrame className="rounded-[10px] border border-base bg-surface p-5">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-navy">Stat overview</h2>
            <div className="mt-4">
              <StatRadarChart stats={{ academic: avg, physical: 0, charisma: 0 }} />
            </div>
            <p className="mt-2 text-xs text-muted">
              Only Academic reflects real grade data right now; physical and social stats aren&apos;t tracked yet.
            </p>
          </CornerFrame>

          <Achievements studentId={person.id} viewer historyPrivate={historyHidden} />
        </>
      )}

      {limitedView && (
        <CornerFrame className="rounded-[10px] border border-base bg-surface p-5 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-base bg-tile text-muted">
            <IconEye size={18} />
          </span>
          <p className="mt-3 text-sm font-semibold text-navy">More is hidden</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
            Achievements, stats, and history stay private until they accept your friend request.
          </p>
        </CornerFrame>
      )}
      </div>
    </div>
  );
}
