# Hierarchy Class - The Rank System

**Version 1.31.1.** This document explains how ranks work in Hierarchy
Class, from a student's perspective and from a teacher/admin perspective.
It covers the ranks, the exact math behind the progress bar, how grades
move it, how seasons reset it, and where everything lives.

---

## 1. The ranks

There are eight ranks, from the bottom up:

```
D → C → B → A → S → S+ → S++ → EX
```

- **Everyone starts at D** with an empty bar (0 / 100). Nobody is born
  ranked - you climb by getting grades.
- **EX is the open-ended top tier.** Once a student reaches EX they stop
  climbing tiers and instead accumulate an uncapped EX score
  (1 point per strong grade, -1 per weak grade, never below 0).

Each rank has a "bar length" that decides how much progress is needed to
advance. The higher you go, the longer the bar:

| Rank | Bar length (n) | Next rank when the bar hits 100 |
|---|---|---|
| D | 3 | C |
| C | 4 | B |
| B | 5 | A |
| A | 6 | S |
| S | 8 | S+ |
| S+ | 10 | S++ |
| S++ | 12 | EX |

---

## 2. How a single grade moves the bar (per-entry isolation)

Since migration 049 the rank engine is **per-entry isolated**: each grade
you receive is evaluated completely on its own. It does **not** blend with
your other grades, does not get dragged up or down by a running average,
and is not compared against a composite of all your categories. Your
other grades simply do not matter for that one grade's contribution - only
the grade itself and the weight of its category.

The math for one grade:

```
entryPct        = (score / maxScore) × 100
entryPctCapped  = min(entryPct, 100)              // bonus credit never over-fills
weightShare     = weight[category] / sum(all configured weights)
Adjusted        = 100 × (entryPctCapped / 100)^k  // k = 1.8 by default
fillChange      = ((Adjusted − 50) / 50) × (100 / n) × weightShare
```

In plain words:

1. **The grade becomes a percentage.** 24 out of 50 → 48%.
2. **It is capped at 100%.** Bonus credit above 100% never over-fills the
   bar (a 58/50 perfect-bonus quiz still only counts as 100% for the bar).
3. **It is scaled by the category weight.** The teacher configures each
   course's categories (e.g. Exam 40%, Quiz 15%, Activity 20%,
   Participation 15%, Group activity 10%). A grade's category weight is
   its share of the total configured weights - so a perfect **Exam**
   (weight 40) moves the bar **2.67× more** than a perfect **Quiz**
   (weight 15). The teacher's weight config is what actually controls how
   much each activity type is worth.
4. **The power curve compresses low scores.** `Adjusted = 100 × (pct/100)^1.8`
   means a 50% grade sits at ~28.7 on the adjusted scale, a 100% grade at
   100. Getting from 90 → 100 is worth far more than 50 → 60.
5. **50% adjusted is the neutral line.** A grade above it fills the bar, a
   grade below it drains the bar. The farther above 50, the more it fills.

### What counts as a strong vs weak grade

| Score | entryPct | Adjusted (k=1.8) | Effect |
|---|---|---|---|
| 100% | 100 | 100 | Full fill for that category's weight share |
| 75% | 75 | 59.6 | Slight fill |
| 50% | 50 | 28.7 | Drains the bar |
| 0% | 0 | 0 | Maximum drain |

### The weight share detail

`weightShare` divides by **all configured weights**, not just the ones
that have grades. This keeps the teacher's config fully in control:

- School default: Exam 40, Quiz 20, Activity 25, Participation 15
  (sum 100) → Exam weight share = 0.40, Quiz = 0.20.
- Course with custom categories (e.g. Exam 40, Quiz 15, Activity 20,
  Participation 15, Group activity 10) → Exam share = 0.40, Quiz = 0.15.

---

## 3. Promotion and demotion

- **Promotion is fill-first.** When the bar reaches 100, you advance to
  the next rank and the bar resets to **exactly 0** - no overflow is
  carried over.
- **Demotion is overflow-based.** A very weak grade can push the bar
  negative. The overflow decides where you land in the previous rank
  (e.g. bar -20 at A lands you in B at 80).
- **A single entry can demote at most two tiers**, and never below D.

---

## 4. The EX tier

EX is special:

- **Reaching EX** (filling the S++ bar) resets the bar to 0 and starts an
  open-ended **EX score**.
- While ranked EX, each strong grade (uncapped adjusted ≥ 50) adds **+1**
  and each weak grade subtracts **−1** (floor 0). The EX score has no upper
  bound.
- A student at EX never demotes out of EX through the normal mechanic -
  only a season reset can move them.

> The EX check uses the **uncapped** adjusted value of the single entry
> (`100 × (entryPct/100)^k`), so bonus credit above 100% still counts
> toward the EX score.

---

## 5. Seasons and reset

A **season = the active semester** (declared by the admin on
Admin → Ranks with start/end dates). Every approved grade during the
semester feeds the student's rank.

At semester end the admin runs **End season**:

- The reset keys off the **final rank**, not the peak:
  - Final rank **A / B / C / D** → next season starts at **D**
  - Final rank **S / S+ / S++ / EX** → next season starts at **C**
- The bar always resets to 0.
- The **peak rank** of the season is recorded in history and drives the
  all-time **highest rank** record, which never goes down.

Example: you reach S mid-semester, end the semester at A → you reset to D,
but your history shows you peaked at S and your all-time highest rank is S.

---

## 6. The live data path (how a grade becomes a rank change)

```
Teacher submits a grade (score / out-of, with the category type)
  → Admin approves it (or rejects it)
  → the approved grade is auto-fed into the rank engine exactly once
  → the student's rank state updates
  → every rank card / leaderboard / roster refreshes live
```

1. **The teacher** configures each course's categories and weights once on
   `/teacher/classroom`, then enters each student's earned score and the
   "out of" max. The submit form is blocked until the admin declares an
   active semester (the semester gate).
2. **The admin** approves grades in Admin → Grade Submissions. Approving
   feeds the grade into the engine (type label → category key, score/max,
   the active semester as period, the course's weights). Each grade feeds
   exactly once.
3. **Rejecting or deleting** an approved grade **reverts its effect**: the
   feed entry is removed and the rank/bar are recomputed from the
   period-start baseline through the remaining grades, so the state lands
   exactly where it would be if the grade had never existed - even when
   clearing all of a student's course data.
4. **Real-time**: rank state changes push to every open page (student
   home/profile, leaderboard, teacher roster, admin panels) with no reload.

---

## 7. Where the system lives

| Piece | Location |
|---|---|
| Pure math (unit-tested) | `lib/rankEngine.ts` + `lib/rankEngine.test.ts` |
| Client rank store | `lib/rankStore.tsx` (`RankProvider`, mounted in `app/layout.tsx`) |
| Rank UI | `components/ui/RankTriangle.tsx` (the inverted-triangle emblem) + `components/ui/RankBadge.tsx` |
| Database (RPCs + tables) | migrations `034`-`049` in `database/migrations/` |
| Season control | Admin → Ranks (`/admin/ranks`) |
| Grade entry | Teacher → Classroom (`/teacher/classroom`) |
| Approve/reject | Admin → Grade Submissions |
| Student view | Student home + profile (`RankBadge`), leaderboard |
| Docs | `docs/RANK_SYSTEM.md` (this file), `docs/BACKEND.md`, `docs/DATABASE.md` |

### Key tables

- `rank_config` - the school's weights, power-curve exponent (k), EX step,
  tier bar lengths, and season reset map.
- `student_rank_state` - one row per student: current rank, bar, EX score,
  season peak, all-time highest, period baseline.
- `rank_period_entries` - one row per fed grade (with its stored weights
  and the before-state for clean reverts).
- `rank_history_log` - the audit trail of every rank change.
- `season_history_log` - one row per student per ended season (peak, final,
  reset-to).
- `course_rank_categories` - per-course category keys/labels/weights.
- `school_semesters` - the admin-declared grading periods.
