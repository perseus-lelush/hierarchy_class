"use client";

import { useSchoolFeed } from "@/lib/schoolFeedStore";
import { FeedPost } from "@/components/feed/FeedPost";
import { StoriesRail } from "@/components/feed/StoriesRail";
import { QuickSearchBar } from "@/components/search/QuickSearchBar";
import { ProfileRankCard } from "@/components/student/ProfileRankCard";
import { ProfileHeroCard } from "@/components/student/ProfileHeroCard";
import HabitTracker from "@/components/dashboard/HabitTracker";
import WeeklyProgress from "@/components/dashboard/WeeklyProgress";
import SubjectStats from "@/components/dashboard/SubjectStats";
import WeakestSubjectCard from "@/components/dashboard/WeakestSubjectCard";
import { InlineLoader } from "@/components/ui/Loading";

export default function StudentHomePage() {
  const { posts, loading: feedLoading, error: feedError } = useSchoolFeed();

  return (
    <div className="space-y-4 sm:space-y-6 pt-0 md:pt-5">
      {/* Tablet/Desktop: search bar at top - centered on tablet, left-aligned on desktop. Hidden on phone. */}
      <div className="hidden md:block mx-auto w-full max-w-md xl:mx-0">
        <QuickSearchBar />
      </div>

      {/* Phone: MyDay just above profile card - restored left, adjusted down. */}
      <div className="block space-y-4 md:hidden">
        <div className="pt-3">
          <StoriesRail />
        </div>
        <ProfileHeroCard />
      </div>

      <div className="hidden md:block">
        <StoriesRail />
      </div>

      <h1 className="section-label mb-3 mt-8">Latest School Feed</h1>

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[1.6fr_1fr]">
        <section className="space-y-4">
          {feedLoading ? (
            <InlineLoader label="Loading announcements..." />
          ) : feedError ? (
            <p className="text-sm text-warn">{feedError}</p>
          ) : posts.length === 0 ? (
            <p className="text-sm text-muted">No announcements yet.</p>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <FeedPost key={post.id} post={post} />
              ))}
            </div>
          )}
        </section>

        {/* Desktop-only right column (xl+, SideNav layout) - identical DOM
            shape to the original (same wrapper divs and order classes) so the
            fractional-pixel layout is unchanged. Below xl these cards live in
            the MobileDrawer instead, so the phone/tablet body is just search,
            stories, and feed. */}
        <aside className="hidden flex-col space-y-4 xl:flex">
          <ProfileRankCard />
          <div className="order-5 lg:order-none">
            <WeakestSubjectCard />
          </div>
          <div className="order-4 lg:order-none">
            <SubjectStats />
          </div>
          <div className="order-2 lg:order-none">
            <HabitTracker />
          </div>
          <div className="order-3 lg:order-none">
            <WeeklyProgress />
          </div>
        </aside>
      </div>
    </div>
  );
}
