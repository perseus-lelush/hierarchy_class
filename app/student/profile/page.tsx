"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { RankBadge } from "@/components/ui/RankBadge";
import { StatBar } from "@/components/ui/StatBar";
import { StatRadarChart } from "@/components/profile/StatRadarChart";
import { CornerFrame } from "@/components/ui/CornerFrame";
import { Wardrobe } from "@/components/profile/Wardrobe";
import { Achievements } from "@/components/profile/Achievements";
import { SeasonHistory } from "@/components/profile/SeasonHistory";
import { StoryArchive } from "@/components/profile/StoryArchive";
import { FriendsModal } from "@/components/profile/FriendsModal";
import { IconMore, IconArchive, IconEye, IconStory, IconUser } from "@/components/ui/icons";
import { useMyProfile } from "@/lib/useMyProfile";
import { useClassroomHierarchy } from "@/lib/classroomHierarchyStore";
import { useFriendsStore } from "@/lib/friendsStore";
import { useMyEnrollment } from "@/lib/useEnrollment";
import { useRankStore } from "@/lib/rankStore";
import { useShop } from "@/lib/shopStore";
import { useStories } from "@/lib/storiesStore";
import { EnrolledBadge } from "@/components/ui/EnrolledBadge";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Modal } from "@/components/ui/Modal";
import { StoryEditor } from "@/components/student/StoryEditor";
import { Button } from "@/components/ui/Button";
import { InlineLoader } from "@/components/ui/Loading";

export default function StudentProfilePage() {
  const { profile, loading, updateProfile, uploadAvatar, removeAvatar } = useMyProfile();
  const { getEntriesByProfile, getStudentAverageByProfile, courses, programs, sections, students: enrollments } = useClassroomHierarchy();
  const { effective: enrollment, loading: enrollmentLoading } = useMyEnrollment();
  const { rankOf } = useRankStore();
  const { equippedProfileCard } = useShop();
  const { createStory } = useStories();

  const [nameDraft, setNameDraft] = useState({ first: "", middle: "", last: "" });
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  const [bio, setBio] = useState("");
  const [isEditingBio, setIsEditingBio] = useState(false);

  const [favoriteSubject, setFavoriteSubject] = useState("");
  const [isEditingSubject, setIsEditingSubject] = useState(false);

  const [hobbies, setHobbies] = useState("");
  const [isEditingHobbies, setIsEditingHobbies] = useState(false);

  // Facebook-style "Edit profile" toggles the whole About block into edit mode.
  const [isEditingAbout, setIsEditingAbout] = useState(false);

  // Story creation (Facebook-style "Create story" button on the profile).
  const [storyFile, setStoryFile] = useState<File | null>(null);
  const [storyCaption, setStoryCaption] = useState("");
  const [publishingStory, setPublishingStory] = useState(false);
  const [storyError, setStoryError] = useState<string | null>(null);
  const storyInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [seasonOpen, setSeasonOpen] = useState(false);
  const [storyArchiveOpen, setStoryArchiveOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewAs, setViewAs] = useState(false);

  // Seed local edit-buffers once the real profile arrives
  const [hydrated, setHydrated] = useState(false);
  if (profile && !hydrated) {
    setBio(profile.bio ?? "");
    setFavoriteSubject(profile.favorite_subject ?? "");
    setHobbies((Array.isArray(profile.hobbies) ? profile.hobbies : []).join(", "));
    setHydrated(true);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setPhotoMessage(null);
    await uploadAvatar(file);
    setUploading(false);
    setPhotoMessage("Profile picture updated.");
  }

  function handleRemoveAvatar() {
    setConfirmingRemove(true);
  }

  async function handleConfirmRemoveAvatar() {
    setUploading(true);
    setPhotoMessage(null);
    await removeAvatar();
    setUploading(false);
    setPhotoMessage("Profile picture removed.");
    setConfirmingRemove(false);
  }

  async function saveBio() {
    await updateProfile({ bio });
    setIsEditingBio(false);
  }
  async function saveFavoriteSubject() {
    await updateProfile({ favorite_subject: favoriteSubject });
    setIsEditingSubject(false);
  }
  async function saveHobbies() {
    await updateProfile({ hobbies: hobbies.split(",").map((h) => h.trim()).filter(Boolean) });
    setIsEditingHobbies(false);
  }
  async function toggleAboutEditing() {
    if (isEditingAbout) {
      // Save all three fields at once.
      await updateProfile({ bio });
      await updateProfile({ favorite_subject: favoriteSubject });
      await updateProfile({ hobbies: hobbies.split(",").map((h) => h.trim()).filter(Boolean) });
      setIsEditingBio(false);
      setIsEditingSubject(false);
      setIsEditingHobbies(false);
    } else {
      setIsEditingBio(true);
      setIsEditingSubject(true);
      setIsEditingHobbies(true);
    }
    setIsEditingAbout(!isEditingAbout);
  }

  async function handleStoryPublish(edited: File, caption: string) {
    setPublishingStory(true);
    setStoryError(null);
    const storyId = await createStory(edited, caption || undefined);
    if (storyId) {
      setStoryFile(null);
    } else {
      setStoryError("Couldn't publish your story. Please try again.");
    }
    setPublishingStory(false);
  }

  function startNameEdit() {
    if (!profile) return;
    setNameDraft({
      first: profile.first_name ?? "",
      middle: profile.middle_name ?? "",
      last: profile.last_name ?? "",
    });
    setNameError(null);
  }

  async function handleSaveName() {
    if (!profile) return;
    setSavingName(true);
    setNameError(null);
    const err = await updateProfile({
      first_name: nameDraft.first,
      middle_name: nameDraft.middle || undefined as unknown as string,
      last_name: nameDraft.last,
    });
    setSavingName(false);
    if (err) {
      setNameError(err);
    }
  }

  const nameCooldownDays = (() => {
    if (!profile?.name_changed_at) return 0;
    const next = new Date(profile.name_changed_at).getTime() + 30 * 86400_000;
    return Math.max(0, Math.ceil((next - Date.now()) / 86400_000));
  })();

  const { friends, loading: friendsLoading, error: friendsError } = useFriendsStore();

  const academicExcellence = profile ? getStudentAverageByProfile(profile.id) ?? 0 : 0;
  const myRank = profile ? rankOf(profile.id) : null;
  const overallRank = myRank?.current_rank ?? "D";
  const rankBar = myRank && myRank.current_rank !== "EX" ? myRank.current_bar : null;
  const rankExScore = myRank?.current_rank === "EX" ? myRank.ex_score : null;

  const academicInfo = useMemo(() => {
    if (!profile) return null;
    const enrolledCourseIds = enrollments.filter((e) => e.profileId === profile.id).map((e) => e.courseId);
    const myCourses = courses.filter((c) => enrolledCourseIds.includes(c.id));
    const mySectionIds = Array.from(new Set(myCourses.map((c) => c.sectionId)));
    const mySections = sections.filter((s) => mySectionIds.includes(s.id));
    const myProgramIds = Array.from(new Set(mySections.map((s) => s.programId)));
    const myPrograms = programs.filter((p) => myProgramIds.includes(p.id));
    return { programs: myPrograms, sections: mySections, courses: myCourses };
  }, [profile, enrollments, courses, sections, programs]);

  const courseBreakdown = useMemo(() => {
    if (!profile) return [];
    const entries = getEntriesByProfile(profile.id);
    const byCourse = new Map<string, number[]>();
    entries.forEach((e) => {
      if (!byCourse.has(e.courseId)) byCourse.set(e.courseId, []);
      byCourse.get(e.courseId)!.push(e.score);
    });
    return Array.from(byCourse.entries()).map(([courseId, scores]) => {
      const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
      const course = courses.find((c) => c.id === courseId);
      return { courseId, courseName: course?.name ?? "Unknown course", avg };
    });
  }, [profile, getEntriesByProfile, courses]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <InlineLoader label="Loading your profile..." />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted">Couldn&apos;t load your profile. Please sign in again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {viewAs && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-accent-soft bg-surface px-4 py-3">
          <p className="text-sm text-muted">Viewing your profile as another student would see it.</p>
          <Button variant="accent" size="sm" onClick={() => setViewAs(false)}>
            Exit View As
          </Button>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.3fr] xl:grid-cols-[0.9fr_1.3fr]">
      <div className="relative min-w-0">
      <CornerFrame className="relative space-y-6 overflow-hidden rounded-[10px] border border-base bg-surface p-5">
        {equippedProfileCard?.image_url && (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${equippedProfileCard.image_url})` }}
            />
            <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--surface)_var(--art-tint),transparent)]" />
          </>
        )}
        <div className="relative space-y-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="group relative">
            <UserAvatar
              name={profile.full_name}
              src={profile.avatar_url}
              size="2xl"
              className="border-2 border-surface"
              profileId={profile.id}
            />
            {/* Instagram-style pencil sits ON the avatar: opens the photo/name editor (hidden in View As). */}
            {!viewAs && (
              <button
                type="button"
                onClick={() => { setEditOpen(true); setPhotoMessage(null); }}
                aria-label="Edit profile photo"
                title="Edit profile photo"
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-base bg-surface text-muted shadow-sm transition hover:border-accent-soft hover:text-navy"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </button>
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <h1 className="text-2xl font-bold text-navy sm:text-3xl">{profile.full_name}</h1>
              {!enrollmentLoading && <EnrolledBadge status={enrollment} size="sm" />}
            </div>
            <p className="mt-2 text-sm text-muted">
              {[profile.educational_level, profile.program ?? (academicInfo?.programs ?? []).map((p) => p.name).join(" · "), profile.level_label]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {/* Bio, favorite subject, and hobbies displayed inline, like a social profile. */}
            {bio.trim() && <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">{bio}</p>}
            {favoriteSubject.trim() && (
              <p className="mt-3 text-sm text-navy">
                <span className="font-semibold text-accent-token">Favorite subject:</span> {favoriteSubject}
              </p>
            )}
            {hobbies.split(",").map((h) => h.trim()).filter(Boolean).length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {hobbies.split(",").map((h) => h.trim()).filter(Boolean).map((h) => (
                  <span key={h} className="rounded-full border border-line bg-tile px-2.5 py-0.5 text-[11px] text-muted">
                    {h}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* About edit card - only visible when "Edit profile" is active.
            When hidden, bio/favorite subject/hobbies are displayed inline
            in the hero section above. Saving is done by the "Save profile"
            action button in the row below. */}
        {isEditingAbout && !viewAs && (
          <div className="rounded-[10px] border border-base bg-[var(--surface-strong)] p-4 text-left">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-muted">About</p>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted">Name</p>
                  {nameCooldownDays > 0 && (
                    <p className="text-[10px] text-faint">Changeable in {nameCooldownDays} day{nameCooldownDays === 1 ? "" : "s"}</p>
                  )}
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  <input
                    value={nameDraft.first}
                    onChange={(e) => setNameDraft((d) => ({ ...d, first: e.target.value }))}
                    onFocus={startNameEdit}
                    placeholder="First"
                    disabled={nameCooldownDays > 0 || savingName}
                    className="w-full rounded-[10px] border border-base bg-surface px-3 py-2 text-sm text-navy outline-none focus:border-accent disabled:opacity-50"
                  />
                  <input
                    value={nameDraft.middle}
                    onChange={(e) => setNameDraft((d) => ({ ...d, middle: e.target.value }))}
                    placeholder="Middle"
                    disabled={nameCooldownDays > 0 || savingName}
                    className="w-full rounded-[10px] border border-base bg-surface px-3 py-2 text-sm text-navy outline-none focus:border-accent disabled:opacity-50"
                  />
                  <input
                    value={nameDraft.last}
                    onChange={(e) => setNameDraft((d) => ({ ...d, last: e.target.value }))}
                    placeholder="Last"
                    disabled={nameCooldownDays > 0 || savingName}
                    className="w-full rounded-[10px] border border-base bg-surface px-3 py-2 text-sm text-navy outline-none focus:border-accent disabled:opacity-50"
                  />
                </div>
                {nameError && <p className="mt-1.5 text-xs text-warn">{nameError}</p>}
                {nameCooldownDays === 0 && (
                  <button
                    type="button"
                    onClick={() => void handleSaveName()}
                    disabled={savingName}
                    className="mt-2 rounded-full border border-base bg-surface px-3 py-1 text-[11px] font-semibold text-navy transition hover:border-accent disabled:opacity-50"
                  >
                    {savingName ? "Saving..." : "Save name"}
                  </button>
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted">Bio</p>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  className="mt-1.5 w-full rounded-[10px] border border-base bg-surface p-3 text-sm text-navy outline-none focus:border-accent"
                />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted">Favorite subject</p>
                <input
                  value={favoriteSubject}
                  onChange={(e) => setFavoriteSubject(e.target.value)}
                  placeholder="e.g. Physics"
                  className="mt-1.5 w-full rounded-[10px] border border-base bg-surface px-3 py-2 text-sm text-navy outline-none focus:border-accent"
                />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted">Hobbies</p>
                <input
                  value={hobbies}
                  onChange={(e) => setHobbies(e.target.value)}
                  placeholder="Hobbies - separate multiple hobbies with commas"
                  className="mt-1.5 w-full rounded-[10px] border border-base bg-surface px-3 py-2 text-sm text-navy outline-none focus:border-accent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Facebook-style action row: Edit profile + Create story (owner only),
            aligned as two equal-width buttons. */}
        {!viewAs && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={toggleAboutEditing}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-[10px] border border-base bg-[var(--surface-strong)] px-3 py-2 text-sm font-semibold text-navy transition hover:border-accent-soft active:scale-[0.98]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              {isEditingAbout ? "Save profile" : "Edit profile"}
            </button>
            <button
              type="button"
              onClick={() => storyInputRef.current?.click()}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-[10px] border border-base bg-[var(--surface-strong)] px-3 py-2 text-sm font-semibold text-navy transition hover:border-accent-soft active:scale-[0.98]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v8M8 12h8" />
              </svg>
              Create story
            </button>
            <input
              ref={storyInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setStoryFile(file);
                  setStoryError(null);
                }
                e.target.value = "";
              }}
              className="hidden"
            />
          </div>
        )}

        {!viewAs && storyError && <p className="text-xs text-warn">{storyError}</p>}

        {/* Rank is the hero; the bar/excellence value renders smaller underneath. */}
        <div className="rounded-[10px] border border-base bg-[var(--surface-strong)] p-5 text-center">
          <RankBadge rank={overallRank} size="lg" bar={rankBar} exScore={rankExScore} />
        </div>

        {/* Tabbed Achievements / Music / Photos / History section, inside the profile card. */}
        <Achievements viewer={viewAs} />

        </div>
      </CornerFrame>

      {/* Profile card three-dot menu: View As + Season History. */}
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        title="More"
        aria-label="More"
        className="absolute right-4 top-4 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-base bg-surface text-muted shadow-sm transition hover:border-accent-soft hover:text-navy"
      >
        <IconMore size={14} />
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-4 top-12 z-40 w-52 rounded-[10px] border border-base bg-surface p-1.5 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setViewAs(true);
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left text-sm font-medium text-navy transition hover:bg-tile"
            >
              <IconEye size={15} className="shrink-0 text-muted" />
              View As
            </button>
            <button
              type="button"
              onClick={() => {
                setSeasonOpen(true);
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left text-sm font-medium text-navy transition hover:bg-tile"
            >
              <IconArchive size={15} className="shrink-0 text-muted" />
              Season History
            </button>
            <button
              type="button"
              onClick={() => {
                setStoryArchiveOpen(true);
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left text-sm font-medium text-navy transition hover:bg-tile"
            >
              <IconStory size={15} className="shrink-0 text-muted" />
              Story Archive
            </button>
            <button
              type="button"
              onClick={() => {
                setFriendsOpen(true);
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left text-sm font-medium text-navy transition hover:bg-tile"
            >
              <IconUser size={15} className="shrink-0 text-muted" />
              Manage friends
            </button>
            <div className="my-1.5 border-t border-base" />
            <button
              type="button"
              onClick={() => {
                void updateProfile({ profile_private: !profile?.profile_private });
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left text-sm font-medium text-navy transition hover:bg-tile"
            >
              <IconEye size={15} className={`shrink-0 ${profile?.profile_private ? "text-accent-token" : "text-muted"}`} />
              {profile?.profile_private ? "Private profile: ON" : "Private profile: OFF"}
            </button>
            <button
              type="button"
              onClick={() => {
                void updateProfile({ friends_private: !profile?.friends_private });
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left text-sm font-medium text-navy transition hover:bg-tile"
            >
              <IconUser size={15} className={`shrink-0 ${profile?.friends_private ? "text-accent-token" : "text-muted"}`} />
              {profile?.friends_private ? "Private friends: ON" : "Private friends: OFF"}
            </button>
            <button
              type="button"
              onClick={() => {
                void updateProfile({ history_private: !profile?.history_private });
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left text-sm font-medium text-navy transition hover:bg-tile"
            >
              <IconArchive size={15} className={`shrink-0 ${profile?.history_private ? "text-accent-token" : "text-muted"}`} />
              {profile?.history_private ? "Private history: ON" : "Private history: OFF"}
            </button>
          </div>
        </>
      )}
      </div>

      <div className="min-w-0 space-y-6">
        {/* Friends Section - moved above Wardrobe per profile hierarchy. */}
        <CornerFrame className="rounded-[10px] border border-base bg-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-navy">Friends</h2>
            {friends.length > 0 && (
              <button
                type="button"
                onClick={() => setFriendsOpen(true)}
                className="rounded-full border border-base px-3 py-1 text-[11px] font-semibold text-navy transition hover:border-accent"
              >
                See All
              </button>
            )}
          </div>
          {friendsLoading ? (
            <InlineLoader label="Loading friends..." className="py-6" />
          ) : friendsError ? (
            <p className="mt-4 text-sm text-warn">{friendsError}</p>
          ) : friends.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No friends yet.</p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-4">
              {friends.slice(0, 8).map((friend) => (
                <Link
                  key={friend.id}
                  href={`/student/profile/view?id=${friend.id}`}
                  className="flex shrink-0 flex-col items-center gap-1.5 transition active:scale-95"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-tile p-[2px]">
                    <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-surface">
                      <UserAvatar name={friend.fullName} src={friend.avatarUrl} size="xl" profileId={friend.id} />
                    </div>
                  </div>
                  <span className="max-w-[64px] truncate text-[11px] font-medium text-muted">
                    {friend.fullName.split(" ")[0]}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CornerFrame>

        {!viewAs && <Wardrobe />}

        <CornerFrame className="rounded-[10px] border border-base bg-surface p-5">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-navy">Stat overview</h2>
          <StatRadarChart stats={{ academic: academicExcellence, physical: 0, charisma: 0 }} />
          <p className="mt-2 text-xs text-muted">
            Physical and Social stats aren&apos;t tracked yet - only Academic reflects real grade data right now.
          </p>
        </CornerFrame>

        {academicInfo && academicInfo.courses.length > 0 && (
          <CornerFrame className="rounded-[10px] border border-base bg-surface p-5">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-navy">My courses</h2>
            <div className="flex flex-wrap gap-2">
              {academicInfo.courses.map((c) => (
                <span key={c.id} className="rounded-full border border-base bg-[var(--surface-strong)] px-3 py-1 text-xs font-medium text-navy">
                  {c.name}
                </span>
              ))}
            </div>
          </CornerFrame>
        )}

        <CornerFrame className="rounded-[10px] border border-base bg-surface p-5">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-navy">Course stats</h2>
          {courseBreakdown.length === 0 ? (
            <p className="text-sm text-muted">No grades recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {courseBreakdown.map((c) => (
                <div key={c.courseId} className="flex flex-col gap-3 xl:flex-row xl:items-center">
                  <div className="flex-1">
                    <StatBar label={c.courseName} value={c.avg} category="academic" />
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted">Grades and ranks are set by your teachers and can&apos;t be edited here.</p>
        </CornerFrame>
      </div>

      {!viewAs && storyFile && (
        <StoryEditor
          file={storyFile}
          publishing={publishingStory}
          onCancel={() => setStoryFile(null)}
          onPublish={(edited, caption) => void handleStoryPublish(edited, caption)}
        />
      )}

      {confirmingRemove && (
        <Modal eyebrow="Profile picture" description="Remove your current photo?" onClose={() => setConfirmingRemove(false)}>
          <p className="mt-2 text-sm leading-6 text-muted">
            Your default avatar will be shown instead. You can upload a new photo anytime.
          </p>
          <div className="mt-5 flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              onClick={handleConfirmRemoveAvatar}
              disabled={uploading}
              loading={uploading}
            >
              {uploading ? "Removing..." : "Remove photo"}
            </Button>
            <Button variant="outline" onClick={() => setConfirmingRemove(false)}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}

      {editOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          style={{
            paddingTop: "max(1rem, env(safe-area-inset-top))",
            paddingRight: "max(1rem, env(safe-area-inset-right))",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
            paddingLeft: "max(1rem, env(safe-area-inset-left))",
          }}
          onClick={() => setEditOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-[10px] border border-base bg-surface p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 h-1 w-10 rounded-full bg-accent-token" />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-token">Edit profile</p>
            <h2 className="mt-2 text-xl font-bold text-navy">Profile picture</h2>

            <div className="mt-5 flex flex-col items-center text-center">
              <UserAvatar
                name={profile.full_name}
                src={profile.avatar_url}
                size="2xl"
                className="border-2 border-surface"
              />
              {photoMessage && <p className="mt-3 text-xs font-semibold text-accent-token">{photoMessage}</p>}
              <p className="mt-2 text-xs text-muted">
                {profile.avatar_url ? "Your current picture" : "You're using the default avatar"}
              </p>
            </div>

            <div className="mt-6 space-y-2">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-full bg-accent-token py-2.5 text-sm font-semibold text-on-accent transition hover:opacity-90 disabled:opacity-50"
              >
                {uploading ? "Uploading..." : profile.avatar_url ? "Change photo" : "Upload photo"}
              </button>
              {profile.avatar_url && (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={handleRemoveAvatar}
                  className="w-full rounded-full border border-warn-soft bg-surface py-2.5 text-sm font-semibold text-warn transition hover-bg-warn-soft disabled:opacity-50"
                >
                  Remove photo
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="w-full rounded-full border border-base py-2.5 text-sm font-semibold text-muted transition hover:border-accent"
              >
                Close
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>
        </div>
      )}
      </div>

      {seasonOpen && (
        <Modal onClose={() => setSeasonOpen(false)} eyebrow="Archive" description="Your rank record, season by season">
          <SeasonHistory />
        </Modal>
      )}

      {storyArchiveOpen && (
        <Modal onClose={() => setStoryArchiveOpen(false)} eyebrow="Archive" description="Your past MyDay stories">
          <StoryArchive />
        </Modal>
      )}

      {friendsOpen && <FriendsModal onClose={() => setFriendsOpen(false)} />}

    </div>
  );
}
