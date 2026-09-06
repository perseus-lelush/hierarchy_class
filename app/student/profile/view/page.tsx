"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ViewStudentProfile } from "@/components/student/ViewStudentProfile";
import { InlineLoader } from "@/components/ui/Loading";

/**
 * Static-routable "view another person's profile" page used by ALL internal
 * navigation (web + standalone Android app): /student/profile/view?id=<id>.
 *
 * The Android bundle is statically exported and cannot serve dynamic path
 * segments, so links pass the profile id as a query parameter. The web
 * deep-link route /student/profile/[id] remains for existing URLs.
 */
export default function ProfileViewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <InlineLoader label="Loading profile..." />
        </div>
      }
    >
      <ProfileViewFromSearch />
    </Suspense>
  );
}

function ProfileViewFromSearch() {
  const searchParams = useSearchParams();
  const profileId = searchParams.get("id");
  if (!profileId) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <p className="text-sm text-warn">No profile specified.</p>
      </div>
    );
  }
  return <ViewStudentProfile profileId={profileId} />;
}
