"use client";

import Link from "next/link";

import { useEffect, useState } from "react";
import { CrownMark } from "@/components/ui/CrownMark";
import { RankTriangle } from "@/components/ui/RankTriangle";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthTabs } from "@/components/auth/AuthTabs";
import { LandingBackground } from "./Background";
import { APP_VERSION } from "@/lib/version";
import { BetaBadge } from "@/components/ui/BetaBadge";
import { usePlatformContext } from "@/lib/usePlatformContext";
import { RANK_DISPLAY_NAMES } from "@/lib/rankEngine";

const GITHUB_URL = "https://github.com/perseus-lelush";

const SECTION_IDS = ["home", "roles", "how", "features", "ranks", "tech"] as const;
type SectionId = (typeof SECTION_IDS)[number];

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".landing-reveal, .reveal-pop, .draw-line");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("in-view");
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="landing-reveal mx-auto mb-14 max-w-[620px] text-center">
      <span className="font-mono-ui mb-3.5 block text-[11px] uppercase tracking-[0.22em] text-[var(--accent)]">
        {eyebrow}
      </span>
      <h2 className="font-display text-[clamp(24px,3vw,32px)] font-semibold text-[#eceef1]">
        {title}
      </h2>
      {sub && <p className="mt-4 text-[14.5px] leading-[1.75] text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                               */
/* ------------------------------------------------------------------ */

const HERO_WORDS = [
  { text: "Make", accent: false },
  { text: "school", accent: false },
  { text: "feel", accent: false },
  { text: "like", accent: false },
  { text: "a", accent: false },
  { text: "game", accent: true },
  { text: "worth", accent: false },
  { text: "playing", accent: true },
];

/* Small accent sparkles that twinkle around the headline after it lands. */
const SPARKLES = [
  { top: "-8%", left: "2%", size: 13, delay: 1.9 },
  { top: "18%", left: "-4%", size: 9, delay: 2.2 },
  { top: "-16%", left: "30%", size: 11, delay: 2.5 },
  { top: "-10%", left: "68%", size: 10, delay: 2.8 },
  { top: "24%", left: "97%", size: 14, delay: 2.1 },
  { top: "-22%", left: "88%", size: 9, delay: 2.6 },
  { top: "52%", left: "-5%", size: 12, delay: 3 },
  { top: "60%", left: "96%", size: 10, delay: 3.3 },
];

function Hero() {
  // Install/download CTA is only meaningful in normal browsers - never
  // inside the installed Android TWA or a standalone PWA.
  const { ready, installedLike } = usePlatformContext();
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="home" className="relative flex min-h-screen flex-col items-center justify-center px-6 pb-24 pt-36 text-center">
      <div className="relative mb-6 flex items-center justify-center">
        <span
          className="absolute h-28 w-28 rounded-full border border-[rgba(158,167,179,0.25)]"
          style={{ animation: "haloPulse 2.6s ease-in-out infinite" }}
          aria-hidden
        />
        <div
          className="relative flex items-center justify-center text-[var(--accent)]"
          style={{ animation: "riseIn 0.6s ease 0.2s both, crownPulse 3.6s ease-in-out 0.2s infinite" }}
        >
          <CrownMark height={58} />
        </div>
      </div>

      <div className="relative mb-3 w-full max-w-[1240px]">
        <h1 className="w-full text-[clamp(34px,7.2vw,104px)] font-bold leading-[1.08] tracking-[-0.015em] text-[#eceef1]">
          {HERO_WORDS.map((word, wi) => (
            <span
              key={word.text}
              className="inline-block whitespace-nowrap"
              style={{ marginRight: "0.22em" }}
            >
              {word.text.split("").map((ch, ci) => (
                <span
                  key={`${wi}-${ci}`}
                  className={word.accent ? "text-shimmer" : ""}
                  style={{
                    display: "inline-block",
                    animation: `${word.accent ? "shimmerText 5.5s linear infinite, " : ""}letterIn 0.55s cubic-bezier(0.22, 1, 0.36, 1) ${0.45 + wi * 0.12 + ci * 0.028}s both`,
                  }}
                >
                  {ch}
                </span>
              ))}
            </span>
          ))}
        </h1>

        {SPARKLES.map((sparkle, i) => (
          <span
            key={i}
            className="pointer-events-none absolute select-none text-[var(--accent)]"
            style={{
              top: sparkle.top,
              left: sparkle.left,
              fontSize: sparkle.size,
              animation: `twinkle 3.2s ease-in-out ${sparkle.delay}s infinite`,
              textShadow: "0 0 10px rgba(158,167,179,0.7)",
            }}
            aria-hidden
          >
            ✦
          </span>
        ))}
      </div>

      <p
        className="font-mono-ui mb-7 text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]"
        style={{ animation: "riseIn 0.6s ease 1.7s both" }}
      >
        Climb the ranks
      </p>

      <p
        className="mb-9 max-w-[640px] text-[15.5px] leading-[1.75] text-[var(--muted)]"
        style={{ animation: "riseIn 0.6s ease 1.85s both" }}
      >
        Every approved grade fills your rank bar, habits build streaks, and your Florin
        unlocks page backgrounds, profile-card art, and avatar borders - equipped from
        your wardrobe and visible across the campus in realtime.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3.5" style={{ animation: "riseIn 0.6s ease 2s both" }}>
        <button
          type="button"
          onClick={() => scrollTo("auth")}
          className="relative overflow-hidden rounded-lg bg-gradient-to-b from-[#c2c7cf] to-[#9ea7b3] px-7 py-3.5 text-[13.5px] font-semibold text-[#141214] transition hover:-translate-y-0.5 hover:brightness-110"
        >
          Enter the ranks
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out hover:translate-x-full"
          />
        </button>
        <button
          type="button"
          onClick={() => scrollTo("roles")}
          className="rounded-lg border border-[rgba(255,255,255,0.14)] px-7 py-3.5 text-[13.5px] font-medium text-[#e7e9ee] transition hover:border-[var(--accent)] hover:text-white"
        >
          See how it works
        </button>
        {/* Hidden inside the installed TWA/PWA - those users already have the app. */}
        {ready && !installedLike && (
          <a
            href="/download"
            className="rounded-lg border border-[rgba(158,167,179,0.35)] px-7 py-3.5 text-[13.5px] font-medium text-[var(--accent)] transition hover:border-[var(--accent)] hover:text-white"
          >
            Get the app
          </a>
        )}
      </div>

      <div
        className="font-mono-ui absolute bottom-9 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.18em] text-[var(--faint)]"
        style={{ animation: "bounce 2.2s ease-in-out infinite" }}
      >
        Scroll
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Roles                                                              */
/* ------------------------------------------------------------------ */

const ROLES = [
  {
    tag: "Students",
    title: "Climb the ladder",
    points: [
      "Track your rank and watch your bar fill with every approved grade",
      "Set personal habit goals and build streaks across study, fitness, reading, sleep, and focus",
      "See live weekly progress, subject stats, and a campus leaderboard",
      "Share MyDay stories, collect achievements, and decorate your profile with shop items and themes",
    ],
  },
  {
    tag: "Teachers",
    title: "Grade with purpose",
    points: [
      "Configure category weights that control rank impact",
      "Input scores out of any total and preview the rank effect",
      "Run quizzes, share materials, and keep notes, schedules, and lesson plans in a personal workspace",
      "Librarian teachers manage the library catalog and pickup requests",
    ],
  },
  {
    tag: "Admins",
    title: "Run the campus",
    points: [
      "Build education levels, programs, year levels, and courses",
      "Declare seasons with start and end dates",
      "Approve grades, moderate the feed, and monitor enrollment",
      "See rank distributions and monitor students and teachers across every level",
    ],
  },
];

function Roles() {
  return (
    <section id="roles" className="mx-auto max-w-[1080px] px-6 py-28">
      <SectionHeading
        eyebrow="Who it is for"
        title="One system for the whole school"
        sub="Students compete, teachers grade, and admins run the season. Everyone sees the same live rank engine."
      />
      <div className="grid gap-5 md:grid-cols-3">
        {ROLES.map((role, i) => (
          <div
            key={role.tag}
            className="reveal-pop group rounded-[14px] border border-base bg-[rgba(48,47,51,0.45)] p-7 transition-all duration-500 hover:-translate-y-1.5 hover:border-[rgba(158,167,179,0.4)] hover:shadow-[0_18px_50px_-24px_rgba(158,167,179,0.35)]"
            style={{ transitionDelay: `${i * 0.1}s` }}
          >
            <span className="font-mono-ui mb-3 block text-[10px] uppercase tracking-[0.18em] text-[var(--accent)]">
              {role.tag}
            </span>
            <h3 className="font-display mb-3.5 text-[19px] font-semibold text-[#eceef1]">{role.title}</h3>
            <ul className="flex flex-col gap-2.5">
              {role.points.map((point) => (
                <li key={point} className="relative pl-4 text-[13.5px] leading-[1.5] text-[var(--muted)] transition-colors group-hover:text-[var(--text)]">
                  <span className="absolute left-0 top-[7px] h-[5px] w-[5px] rounded-full bg-[var(--accent)] transition-transform duration-300 group-hover:scale-150" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* How it works                                                       */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    num: "01",
    title: "Teachers grade",
    body: "Configure category weights, enter scores out of any total, and preview the rank effect before submitting.",
  },
  {
    num: "02",
    title: "Admins approve",
    body: "Approved grades feed the engine; the season is declared with start and end dates.",
  },
  {
    num: "03",
    title: "Ranks climb live",
    body: "Every bar fills in realtime. Habits, feed, and leaderboards move with it.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-[1080px] px-6 py-28">
      <SectionHeading
        eyebrow="How it works"
        title="From grade to rank in three steps"
        sub="One clean loop: teachers grade, admins approve, students climb. Every approved grade is weighed by its category and moves the bar on its own."
      />
      <div className="relative">
        <div className="draw-line absolute left-[16%] right-[16%] top-[26px] hidden h-px bg-gradient-to-r from-transparent via-[var(--accent)]/40 to-transparent md:block" />
        <div className="grid gap-10 md:grid-cols-3 md:gap-6">
          {STEPS.map((step, i) => (
            <div key={step.num} className="reveal-pop relative flex flex-col items-center text-center" style={{ transitionDelay: `${i * 0.15}s` }}>
              <div
                className="relative z-10 mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-full border border-[var(--accent)]/40 bg-[rgba(48,47,51,0.7)] text-[var(--accent)] transition-transform duration-300 hover:scale-110"
              >
                <CrownMark height={22} />
              </div>
              <span className="font-mono-ui mb-1 text-[10px] uppercase tracking-[0.2em] text-[var(--faint)]">
                Step {step.num}
              </span>
              <h3 className="font-display mb-2 text-[17px] font-semibold text-[#eceef1]">{step.title}</h3>
              <p className="max-w-[260px] text-[13px] leading-[1.65] text-[var(--muted)]">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Features                                                           */
/* ------------------------------------------------------------------ */

const FEATURES = [
  {
    title: "Non-linear rank engine",
    body: "Each grade is judged on its own with its category weight - no running average blends your scores, and anything below the neutral line drains the bar.",
  },
  {
    title: "Live realtime sync",
    body: "Grades, ranks, messages, habits, and notifications update the moment they change. No refresh needed.",
  },
  {
    title: "Habit tracker",
    body: "Study, exercise, reading, sleep, and focus - custom targets, daily or weekly, with streaks and a history calendar.",
  },
  {
    title: "Classroom grading",
    body: "Teachers configure category weights, enter scores out of any total, and preview the rank effect before submitting.",
  },
  {
    title: "Weekly progress & stats",
    body: "Live weekly progress, per-subject performance, and a campus-wide leaderboard keep every climb visible.",
  },
  {
    title: "Seasons and resets",
    body: "Admins declare semesters. When a season ends, your final rank is recorded and the ladder resets for the next one.",
  },
  {
    title: "Florin shop & wardrobe",
    body: "Buy page backgrounds, profile card art, and avatar borders, then equip them from your wardrobe and show them off across the campus.",
  },
  {
    title: "Midnight & Rose themes",
    body: "Two palettes - a cool slate midnight and a soft pink rose - picked once and applied across the whole app.",
  },
  {
    title: "Messaging & social profiles",
    body: "Campus-wide chat with notifications that open the exact conversation, profiles with bio and hobbies, a school feed, MyDay stories, and an in-app library and quiz engine.",
  },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-[1080px] px-6 py-28">
      <SectionHeading
        eyebrow="What is inside"
        title="Built for momentum, not just grades"
        sub="Every feature exists to keep students showing up: live feedback, visible progress, and a ladder worth climbing."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, i) => (
          <div
            key={feature.title}
            className="reveal-pop group relative overflow-hidden rounded-xl border border-base bg-[rgba(48,47,51,0.32)] p-6 transition-all duration-500 hover:-translate-y-1 hover:border-[rgba(158,167,179,0.4)] hover:shadow-[0_18px_50px_-24px_rgba(158,167,179,0.35)]"
            style={{ transitionDelay: `${(i % 3) * 0.09}s` }}
          >
            <span
              className="pointer-events-none absolute -right-2 -top-2 select-none text-[var(--accent)] opacity-30 transition-all duration-500 group-hover:rotate-12 group-hover:opacity-100"
              style={{ fontSize: 26 }}
              aria-hidden
            >
              ✦
            </span>
            <h4 className="mb-2 text-[14.5px] font-semibold text-[#eceef1]">{feature.title}</h4>
            <p className="text-[13px] leading-[1.6] text-[var(--muted)]">{feature.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Rank ladder                                                        */
/* ------------------------------------------------------------------ */

const RANKS = [
  { letter: "D", note: "Fresh start" },
  { letter: "C", note: "Building" },
  { letter: "B", note: "Consistent" },
  { letter: "A", note: "Strong" },
  { letter: "S", note: "Elite" },
  { letter: "S+", note: RANK_DISPLAY_NAMES["S+"] },
  { letter: "S++", note: RANK_DISPLAY_NAMES["S++"] },
  { letter: "EX", note: RANK_DISPLAY_NAMES["EX"] },
] as const;

function RankLadder() {
  return (
    <section id="ranks" className="mx-auto max-w-[1080px] px-6 py-28">
      <SectionHeading
        eyebrow="The ladder"
        title="Eight ranks, one climb"
        sub={`Every season starts fresh: S and above land in C, A and below land in D. Promotion happens when your bar fills; the EX tier belongs to ${RANK_DISPLAY_NAMES["EX"]} seasons.`}
      />
      <div className="mb-10 grid grid-cols-4 gap-3 sm:grid-cols-8">
        {RANKS.map((rank, i) => (
          <div
            key={rank.letter}
            className="reveal-pop group flex flex-col items-center gap-2 rounded-[10px] border border-base bg-[rgba(48,47,51,0.32)] px-2 py-4 transition-all duration-500 hover:-translate-y-1.5 hover:border-[rgba(158,167,179,0.45)] hover:shadow-[0_16px_40px_-20px_rgba(158,167,179,0.45)]"
            style={{ transitionDelay: `${0.15 + i * 0.07}s` }}
          >
            <RankTriangle
              rank={rank.letter}
              size="lg"
              className="transition-transform duration-300 group-hover:scale-110"
            />
            <span className="text-center text-[10px] leading-tight text-[var(--faint)] transition-colors group-hover:text-[var(--muted)]">
              {rank.note}
            </span>
          </div>
        ))}
      </div>
      <div className="landing-reveal mx-auto grid max-w-[760px] gap-3 text-center sm:grid-cols-2">
        {[
          "Every approved grade feeds its own bar with its category weight",
          "The bar fills toward promotion and drains below the neutral line",
          "Season ends reset the ladder but record your final and peak rank",
          "Teachers control weight, admins control the season",
        ].map((point) => (
          <p key={point} className="rounded-lg border border-base bg-[rgba(48,47,51,0.32)] px-5 py-4 text-[13px] leading-[1.6] text-[var(--muted)]">
            {point}
          </p>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tech                                                               */
/* ------------------------------------------------------------------ */

const TECH = [
  "Next.js 14",
  "TypeScript",
  "Tailwind CSS",
  "Supabase",
  "PostgreSQL",
  "Realtime",
  "Row Level Security",
  "Supabase Storage",
  "Recharts",
];

function Tech() {
  return (
    <section id="tech" className="mx-auto max-w-[1080px] px-6 py-24">
      <SectionHeading
        eyebrow="Under the hood"
        title="Modern, secure, realtime"
        sub="A typed app router frontend over a Postgres backend with row-level security and live subscriptions."
      />
      <div className="landing-reveal flex flex-wrap justify-center gap-2.5">
        {TECH.map((item) => (
          <span
            key={item}
            className="font-mono-ui rounded-full border border-base bg-[rgba(48,47,51,0.28)] px-4 py-2 text-[11.5px] tracking-[0.04em] text-[var(--muted)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--accent)] hover:text-[#eceef1]"
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Auth                                                               */
/* ------------------------------------------------------------------ */

function AuthSection() {
  return (
    <section id="auth" className="flex min-h-screen items-center justify-center px-6 py-36">
      <AuthCard>
        <AuthTabs />
      </AuthCard>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                             */
/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="relative z-[2] border-t border-base px-6 py-12 text-center">
      <div className="mx-auto flex max-w-[1080px] flex-col items-center gap-6">
        <div className="flex items-center gap-2.5">
          <CrownMark height={22} className="text-[var(--accent)]" />
          <span className="font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-[#eceef1]">
            Hierarchy Class
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-[12.5px]">
          <a href="#home" className="text-[var(--muted)] transition hover:text-[#eceef1]">Home</a>
          <a href="#roles" className="text-[var(--muted)] transition hover:text-[#eceef1]">Roles</a>
          <a href="#features" className="text-[var(--muted)] transition hover:text-[#eceef1]">Features</a>
          <Link href="/download" className="text-[var(--muted)] transition hover:text-[#eceef1]">Download</Link>
          <a href="#ranks" className="text-[var(--muted)] transition hover:text-[#eceef1]">Ranks</a>
          <a href="/terms" className="text-[var(--muted)] transition hover:text-[#eceef1]">Terms and Conditions</a>
          <a href="/privacy" className="text-[var(--muted)] transition hover:text-[#eceef1]">Privacy Policy</a>
        </div>

        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-full border border-base bg-[rgba(48,47,51,0.4)] px-4 py-2 text-[12px] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[#eceef1]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49v-1.7c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.94.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05a9.36 9.36 0 015 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9v2.82c0 .27.18.6.69.49A10.25 10.25 0 0022 12.25C22 6.58 17.52 2 12 2z" />
          </svg>
          github.com/perseus-lelush
        </a>

        <p className="text-[11.5px] text-[var(--faint)]">
          © {new Date().getFullYear()} Hierarchy Class · v{APP_VERSION} · Make school feel like a game worth playing <BetaBadge />
        </p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export function Landing() {
  useReveal();
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState<SectionId>("home");

  useEffect(() => {
    const onScroll = () => {
      const root = document.documentElement;
      const max = root.scrollHeight - root.clientHeight;
      setProgress(max > 0 ? (root.scrollTop / max) * 100 : 0);
      setScrolled(window.scrollY > 10);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id as SectionId);
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  const NAV_LINKS: Array<[string, SectionId]> = [
    ["Home", "home"],
    ["Roles", "roles"],
    ["How", "how"],
    ["Features", "features"],
    ["Ranks", "ranks"],
    ["Tech", "tech"],
  ];

  return (
    <div className="dark relative min-h-screen overflow-x-hidden bg-[var(--bg)] text-[var(--text)]">
      {/* Scroll progress */}
      <div className="fixed inset-x-0 top-0 z-[60] h-[3px] bg-transparent">
        <div
          className="h-full bg-gradient-to-r from-[var(--accent)] to-[#c2c7cf] transition-[width] duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <LandingBackground />

      {/* Navbar */}
      <nav
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
          scrolled ? "border-b border-base bg-[rgba(20,18,20,0.75)] backdrop-blur-xl" : "border-b border-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-3.5">
          <a href="#home" className="flex items-center gap-2">
            <CrownMark height={24} className="text-[var(--accent)]" />
            <span className="font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-[#eceef1]">
              Hierarchy Class
            </span>
          </a>

          <div className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map(([label, id]) => (
              <a
                key={id}
                href={`#${id}`}
                className={`relative text-[13px] transition ${
                  active === id
                    ? "font-medium text-[var(--accent)] after:absolute after:-bottom-1.5 after:left-0 after:h-px after:w-full after:bg-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-[#eceef1]"
                }`}
              >
                {label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <a
              href="/login"
              className="hidden rounded-lg border border-[rgba(255,255,255,0.14)] px-5 py-2.5 text-[12.5px] font-medium text-[#e7e9ee] transition hover:border-[var(--accent)] hover:text-white sm:block"
            >
              Log in
            </a>
            <a
              href="/signup"
              className="relative overflow-hidden rounded-lg bg-gradient-to-b from-[#c2c7cf] to-[#9ea7b3] px-5 py-2.5 text-[12.5px] font-semibold text-[#141214] transition hover:-translate-y-px hover:brightness-110"
            >
              Sign up
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out hover:translate-x-full"
              />
            </a>
          </div>
        </div>
      </nav>

      <main className="relative z-[2]">
        <Hero />
        <Roles />
        <HowItWorks />
        <Features />
        <RankLadder />
        <Tech />
        <AuthSection />
      </main>

      <Footer />
    </div>
  );
}
