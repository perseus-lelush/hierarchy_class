-- ===========================================================================
-- 074_profile_privacy.sql
-- User-controlled privacy for profiles (v1.29.0 beta feedback):
--
--   1. profiles.history_private  - when TRUE, other STUDENTS cannot read this
--      student's rank history (rank_history_log). Teachers/admins always can
--      (school supervision). Default FALSE = visible, matching the product's
--      "history is public unless you make it private" model.
--   2. profiles.friends_private  - when TRUE, other students cannot read this
--      user's friend list rows. A friendship row is hidden from outsiders if
--      EITHER party is private (conservative: friend lists are mutual).
--   3. profiles.profile_private  - UI-level flag: other students see a
--      limited profile card (name/avatar/role/rank) instead of the full
--      profile. Enforced app-side; RLS keeps profiles school-readable because
--      search/leaderboards/avatars need them.
--
-- rank_history_log: replaces 066's own-rows-only student policy with
-- "own rows OR owner allows public history". friends: 013's participant-only
-- read is extended with the same-school public-list exception.
--
-- Idempotent (DROP/IF NOT EXISTS) per project convention.
-- ===========================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS history_private BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS friends_private BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_private BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.history_private IS
  'User privacy: when true, other students cannot view this student''s rank history. Teachers/admins always can.';
COMMENT ON COLUMN profiles.friends_private IS
  'User privacy: when true, other students cannot view this user''s friend list. A friendship row is hidden when either party is private.';
COMMENT ON COLUMN profiles.profile_private IS
  'User privacy: when true, other students see a limited profile card instead of the full profile.';

-- ---------------------------------------------------------------------------
-- rank_history_log: students may read a schoolmate's history only while the
-- owner's history_private is false. Own rows and staff access unchanged.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "rank_history_school_read" ON rank_history_log;

CREATE POLICY "rank_history_school_read" ON rank_history_log FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.school_id = rank_history_log.school_id
      AND (
        p.role IN ('admin', 'teacher')
        OR rank_history_log.student_id = p.id
        OR NOT EXISTS (
          SELECT 1 FROM profiles owner
          WHERE owner.id = rank_history_log.student_id
            AND owner.school_id = p.school_id
            AND owner.history_private = true
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- friends: participants always read their own rows. Same-school outsiders may
-- read a friendship row only while BOTH parties allow public friend lists.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "friends_read_own" ON friends;

CREATE POLICY "friends_read_own" ON friends FOR SELECT USING (
  user_a_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR user_b_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR (
    EXISTS (
      SELECT 1 FROM profiles me
      WHERE me.user_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1 FROM profiles a
      WHERE a.id = friends.user_a_id AND a.friends_private = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM profiles b
      WHERE b.id = friends.user_b_id AND b.friends_private = true
    )
    AND EXISTS (
      SELECT 1 FROM profiles a
      JOIN profiles me ON me.school_id = a.school_id
      WHERE a.id = friends.user_a_id AND me.user_id = auth.uid()
    )
  )
);
