-- ===========================================================================
-- 077_group_chat_fixes.sql (v1.30.3, beta follow-up)
--
-- 1) BUG: create_chat_group inserts a group row WITHOUT role_b, but 075 only
--    dropped NOT NULL on user_b_id - role_b kept NOT NULL, so EVERY group
--    creation failed with:
--      null value in column "role_b" ... violates not-null constraint
--    Groups are member-based; role_a/role_b are pair columns. Drop NOT NULL
--    on role_b (and stamp 'group' on any existing group rows defensively).
--
-- 2) Group kind per the Penpot Create-group design (School / Friends type
--    selector): conversations.group_kind, and create_chat_group gains an
--    optional p_kind parameter ('school' | 'friends', default 'school').
--
-- 3) Group name: allow all kinds of characters, length up to 80 (was 60).
-- Idempotent per project convention.
-- ===========================================================================

ALTER TABLE conversations ALTER COLUMN role_b DROP NOT NULL;

-- Defensive backfill (no group rows exist yet in practice - all inserts failed).
UPDATE conversations SET role_b = 'group' WHERE is_group = true AND role_b IS NULL;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_kind TEXT;
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_group_kind_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_group_kind_check
  CHECK (group_kind IS NULL OR group_kind IN ('school', 'friends'));

-- Relaxed name: all characters allowed (emoji, spaces, punctuation), 1-80.
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_title_group_required;
ALTER TABLE conversations ADD CONSTRAINT conversations_title_group_required
  CHECK (is_group = false OR (title IS NOT NULL AND length(btrim(title)) BETWEEN 1 AND 80));

COMMENT ON COLUMN conversations.group_kind IS
  'Penpot design: group type chosen at creation - school or friends. NULL for 1:1 threads.';

-- ---------------------------------------------------------------------------
-- create_chat_group: role_b set, kind parameter, relaxed title length.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_chat_group(p_title TEXT, p_member_ids UUID[], p_kind TEXT DEFAULT 'school')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID;
  my_school UUID;
  clean_title TEXT;
  clean_kind TEXT;
  member UUID;
  member_school UUID;
  conv_id UUID;
BEGIN
  SELECT id, school_id INTO me, my_school FROM profiles WHERE user_id = auth.uid();
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  clean_title := btrim(COALESCE(p_title, ''));
  IF length(clean_title) < 1 OR length(clean_title) > 80 THEN
    RAISE EXCEPTION 'Group name must be 1-80 characters';
  END IF;

  clean_kind := COALESCE(btrim(COALESCE(p_kind, 'school')), 'school');
  IF clean_kind NOT IN ('school', 'friends') THEN
    RAISE EXCEPTION 'Unknown group type';
  END IF;

  INSERT INTO conversations (school_id, is_group, title, created_by, user_a_id, role_a, role_b, group_kind)
  VALUES (my_school, true, clean_title, me, me, 'group', 'group', clean_kind)
  RETURNING id INTO conv_id;

  INSERT INTO conversation_members (conversation_id, profile_id, read_at)
  VALUES (conv_id, me, now());

  IF p_member_ids IS NOT NULL THEN
    FOREACH member IN ARRAY p_member_ids LOOP
      CONTINUE WHEN member IS NULL OR member = me;
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM conversation_members
        WHERE conversation_id = conv_id AND profile_id = member
      );

      SELECT school_id INTO member_school FROM profiles WHERE id = member;
      IF member_school IS DISTINCT FROM my_school THEN
        RAISE EXCEPTION 'All members must be in your school';
      END IF;
      IF EXISTS (
        SELECT 1 FROM chat_blocks
        WHERE (blocker_id = me AND blocked_id = member)
           OR (blocker_id = member AND blocked_id = me)
      ) THEN
        RAISE EXCEPTION 'Messaging is blocked with a selected member';
      END IF;

      INSERT INTO conversation_members (conversation_id, profile_id)
      VALUES (conv_id, member);
    END LOOP;
  END IF;

  RETURN conv_id;
END;
$$;
