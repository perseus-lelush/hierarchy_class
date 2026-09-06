"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMyProfile } from "@/lib/useMyProfile";
import { useFriendsStore } from "@/lib/friendsStore";
import { useAcademicIdentity } from "@/lib/useAcademicIdentity";
import { useRankStore } from "@/lib/rankStore";
import { useSchoolEnrollments, effectiveFrom } from "@/lib/useEnrollment";
import { useClassroomHierarchy } from "@/lib/classroomHierarchyStore";
import { useShop } from "@/lib/shopStore";
import { EnrolledBadge } from "@/components/ui/EnrolledBadge";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { RankBadge } from "@/components/ui/RankBadge";
import { FriendActionButton } from "@/components/profile/FriendActionButton";
import { registerBackHandler } from "@/lib/nativeBackHandler";
import { IconLock } from "@/components/ui/icons";
import type { ProfileRow } from "@/types/supabase";

/**
 * Profile preview that opens in place (over the current page) when a person is
 * picked from a search result - the menu never changes. Full profile still
 * lives at /student/profile/[id] for deep links.
 *
 * Honors the target's profile_private flag: non-friend students get a
 * limited card (name/avatar/role/rank + add-friend), mirroring the full
 * profile view.
 */
export function ProfileModal({ person, onClose }: { person: ProfileRow; onClose: () => void }) {
  const { profileCardOf } = useShop();
  const cardBg = profileCardOf(person.id);
  const router = useRouter();

  // Android hardware back closes the preview before any navigation happens.
  useEffect(() => {
    return registerBackHandler(() => {
      onClose();
      return true;
    });
  }, [onClose]);

  const { profile: me } = useMyProfile();
  const { rankOf } = useRankStore();
  const { getCoursesByTeacher } = useClassroomHierarchy();
  const identity = useAcademicIdentity(person.id);
  const { statuses } = useSchoolEnrollments();
  const { friendIds } = useFriendsStore();

  const isStudent = person.role === "student";
  const isFriend = friendIds.includes(person.id);
  const isSelf = me?.id === person.id;
  const viewerIsStaff = me?.role === "teacher" || me?.role === "admin";
  const limitedView =
    isStudent && !!person.profile_private && !isFriend && !viewerIsStaff && !isSelf;
  const coursesTaught = isStudent ? [] : getCoursesByTeacher(person.id);
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

  const hobbies = Array.isArray(person.hobbies) && person.hobbies.length > 0 ? person.hobbies : [];

  function handleMessage() {
    router.push(`/${me?.role ?? "student"}/messages?with=${person.id}`);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[10px] border border-base bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cover strip: the person's equipped profile-card background when
            they own one, otherwise the flat decorative token strip. */}
        <div
          className="relative h-20 bg-cover bg-center"
          style={cardBg ? { backgroundImage: `url(${cardBg})` } : undefined}
        >
          {!cardBg && <div className="absolute inset-0 bg-asphalt/50" />}
          {cardBg && <div className="cover-tint absolute inset-0" />}
        </div>

        <div className="px-5 pb-5 max-sm:px-4">
          <div className="-mt-10 flex flex-col items-center text-center">
            <UserAvatar
              name={person.full_name}
              src={person.avatar_url}
              size="2xl"
              className="border-2 border-surface"
              profileId={person.id}
            />
            <div className="mt-3 flex flex-col items-center">
              <div className="flex max-w-full flex-wrap items-center justify-center gap-2">
                <h2 className="break-words text-lg font-bold text-navy">{person.full_name}</h2>
                {isStudent && !isSelf && <EnrolledBadge status={enrollment} size="sm" />}
              </div>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-accent">
                {isStudent ? "Student" : "Faculty"}
              </p>
              {!limitedView && isStudent && identityLine && (
                <p className="mt-1 text-sm text-muted">{identityLine}</p>
              )}
            </div>

            {isStudent && !isSelf && (
              <div className="mt-3">
                <RankBadge rank={rank} size="sm" bar={rankBar} exScore={rankExScore} />
              </div>
            )}

            {limitedView ? (
              <div className="mt-4 flex w-full flex-col items-center gap-2 rounded-[10px] border border-base bg-[var(--surface-strong)] px-4 py-5 text-center">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent-token">
                  <IconLock size={16} />
                </span>
                <p className="text-sm font-semibold text-navy">Private profile</p>
                <p className="text-xs text-muted">Add them as a friend to see more.</p>
              </div>
            ) : (
              <>
                {!person.bio && hobbies.length === 0 && (
                  <p className="mt-4 w-full text-left text-sm leading-6 text-muted">
                    {person.full_name.split(" ")[0]} hasn&apos;t added a bio or hobbies yet.
                  </p>
                )}
                {person.bio && <p className="mt-4 w-full text-left text-sm leading-6 text-muted">{person.bio}</p>}
                {hobbies.length > 0 && (
                  <div className="mt-3 flex w-full flex-wrap justify-center gap-2">
                    {hobbies.map((h) => (
                      <span
                        key={h}
                        className="rounded-full border border-line bg-tile px-2.5 py-0.5 text-[11px] text-muted"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {!limitedView && !isStudent && coursesTaught.length > 0 && (
            <div className="mt-4 border-t border-base pt-4 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-faint">Teaching</p>
              <div className="mt-2 flex flex-wrap gap-2">
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

          <div className="mt-5 grid grid-cols-2 gap-2 max-sm:grid-cols-1">
            {isStudent && !isSelf && (
              <FriendActionButton
                targetId={person.id}
                targetName={person.full_name}
                isFriend={isFriend}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  isFriend
                    ? "border border-base bg-surface text-muted hover-border-warn-soft hover-text-warn"
                    : "bg-accent text-on-accent hover:opacity-90"
                }`}
              />
            )}
            {!isSelf && (
              <button
                type="button"
                onClick={handleMessage}
                className="rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white transition hover-bg-accent-token hover-text-on-accent"
              >
                Message
              </button>
            )}
            <button
              type="button"
              onClick={() => router.push(`/student/profile/view?id=${person.id}`)}
              className="col-span-2 rounded-full border border-base px-4 py-2 text-xs font-semibold text-navy transition hover:border-accent max-sm:col-span-1"
            >
              View full profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
