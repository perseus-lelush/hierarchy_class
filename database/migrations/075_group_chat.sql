-- ===========================================================================
-- 075_group_chat.sql (v1.29.0, beta feature #4)
-- Group chats: conversations become a unified container for 1:1 threads AND
-- groups, so chat_messages / notifications / realtime keep working unchanged.
--
-- Model:
--   conversations.is_group = false  → classic pair (user_a/user_b columns).
--   conversations.is_group = true   → user_b_id is NULL, title set, members
--     live in conversation_members (with per-member read/archived/deleted
--     timestamps replacing the pair columns read_at_a/b, archived_a/b,
--     deleted_a/b).
--
-- New RPCs: create_chat_group, add_chat_group_members, leave_chat_group.
-- Rewritten RPCs (group-aware): send_chat_message, set_conversation_read,
-- set_conversation_archived, delete_conversation, get_unread_counts.
--
-- Idempotent per project convention.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Schema
-- ---------------------------------------------------------------------------
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE conversations ALTER COLUMN user_b_id DROP NOT NULL;

-- Group title: required for groups, forbidden-ish (NULL) for pairs.
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_title_group_required;
ALTER TABLE conversations ADD CONSTRAINT conversations_title_group_required
  CHECK (is_group = false OR (title IS NOT NULL AND length(btrim(title)) BETWEEN 1 AND 60));

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_conversation_members_profile
  ON conversation_members (profile_id);

-- ---------------------------------------------------------------------------
-- 2) Participation helper (the single source for RLS + RPCs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_chat_participant(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = p_conversation_id
      AND (
        c.user_a_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
        OR c.user_b_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
        OR EXISTS (
          SELECT 1 FROM conversation_members m
          WHERE m.conversation_id = c.id
            AND m.profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "conversations_thread_read" ON conversations;
CREATE POLICY "conversations_thread_read" ON conversations FOR SELECT USING (
  public.is_chat_participant(id)
);

DROP POLICY IF EXISTS "chat_messages_participant_read" ON chat_messages;
CREATE POLICY "chat_messages_participant_read" ON chat_messages FOR SELECT USING (
  public.is_chat_participant(conversation_id)
);

DROP POLICY IF EXISTS "chat_messages_participant_create" ON chat_messages;
CREATE POLICY "chat_messages_participant_create" ON chat_messages FOR INSERT WITH CHECK (
  from_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  AND public.is_chat_participant(conversation_id)
);

-- conversation_members: members can see the roster. Writes go through RPCs.
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversation_members_read" ON conversation_members;
CREATE POLICY "conversation_members_read" ON conversation_members FOR SELECT USING (
  public.is_chat_participant(conversation_id)
);

-- ---------------------------------------------------------------------------
-- 4) create_chat_group(p_title, p_member_ids) → UUID
--    Creator + members must share the caller's school. Any block between the
--    creator and a candidate member rejects that member... by rejecting the
--    whole call with a clear message (matches 1:1 semantics; keeps beta
--    simple - block checks BETWEEN other members are enforced at send time).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_chat_group(p_title TEXT, p_member_ids UUID[])
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID;
  my_school UUID;
  clean_title TEXT;
  member UUID;
  member_school UUID;
  conv_id UUID;
BEGIN
  SELECT id, school_id INTO me, my_school FROM profiles WHERE user_id = auth.uid();
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  clean_title := btrim(COALESCE(p_title, ''));
  IF length(clean_title) < 1 OR length(clean_title) > 60 THEN
    RAISE EXCEPTION 'Group name must be 1-60 characters';
  END IF;

  INSERT INTO conversations (school_id, is_group, title, created_by, user_a_id, role_a)
  VALUES (my_school, true, clean_title, me, me, 'group')
  RETURNING id INTO conv_id;

  INSERT INTO conversation_members (conversation_id, profile_id, read_at)
  VALUES (conv_id, me, now());

  IF p_member_ids IS NOT NULL THEN
    FOREACH member IN ARRAY p_member_ids LOOP
      CONTINUE WHEN member IS NULL OR member = me;
      -- De-duplicate within the call.
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

-- ---------------------------------------------------------------------------
-- 5) add_chat_group_members(p_conversation_id, p_member_ids) - owner only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_chat_group_members(p_conversation_id UUID, p_member_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv conversations%ROWTYPE;
  me UUID;
  my_school UUID;
  member UUID;
  member_school UUID;
BEGIN
  SELECT * INTO conv FROM conversations WHERE id = p_conversation_id;
  IF conv.id IS NULL OR NOT conv.is_group THEN
    RAISE EXCEPTION 'Group conversation not found';
  END IF;

  SELECT id, school_id INTO me, my_school FROM profiles WHERE user_id = auth.uid();
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF conv.created_by <> me THEN
    RAISE EXCEPTION 'Only the group creator can add members';
  END IF;

  IF p_member_ids IS NOT NULL THEN
    FOREACH member IN ARRAY p_member_ids LOOP
      CONTINUE WHEN member IS NULL OR member = me;
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM conversation_members
        WHERE conversation_id = conv.id AND profile_id = member
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
      VALUES (conv.id, member);
    END LOOP;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) leave_chat_group(p_conversation_id) - any member. The owner leaving
--    keeps the group alive; the group simply has no owner afterwards.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_chat_group(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID;
BEGIN
  SELECT id INTO me FROM profiles WHERE user_id = auth.uid();
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM conversation_members
  WHERE conversation_id = p_conversation_id AND profile_id = me;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) send_chat_message - group-aware (participant via members, fan-out
--    notifications to members, block-aware per member).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_chat_message(p_conversation_id UUID, p_text TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID;
  my_name TEXT;
  new_id UUID;
  conv conversations%ROWTYPE;
  other_participant UUID;
  other_role TEXT;
  other_messages_path TEXT;
  recently_read BOOLEAN;
  member RECORD;
  member_role TEXT;
  member_path TEXT;
BEGIN
  IF p_text IS NULL OR length(trim(p_text)) = 0 THEN
    RAISE EXCEPTION 'Message is empty';
  END IF;
  IF length(p_text) > 2000 THEN
    RAISE EXCEPTION 'Message too long';
  END IF;

  SELECT id, full_name INTO me, my_name FROM profiles WHERE user_id = auth.uid();
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO conv FROM conversations WHERE id = p_conversation_id;
  IF conv.id IS NULL THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;

  IF NOT conv.is_group THEN
    -- ---------------- classic 1:1 path (unchanged semantics) -------------
    IF conv.user_a_id <> me AND conv.user_b_id <> me THEN
      RAISE EXCEPTION 'Not a participant of this conversation';
    END IF;
    other_participant := CASE WHEN conv.user_a_id = me THEN conv.user_b_id ELSE conv.user_a_id END;

    IF EXISTS (
      SELECT 1 FROM chat_blocks
      WHERE (blocker_id = me AND blocked_id = other_participant)
         OR (blocker_id = other_participant AND blocked_id = me)
    ) THEN
      RAISE EXCEPTION 'Messaging is blocked with this user';
    END IF;

    INSERT INTO chat_messages (conversation_id, from_id, from_name, text)
    VALUES (p_conversation_id, me, my_name, trim(p_text))
    RETURNING id INTO new_id;

    IF conv.user_a_id = me THEN
      UPDATE conversations
      SET last_message = trim(p_text), last_message_at = now(), archived_b = NULL
      WHERE id = p_conversation_id;
    ELSE
      UPDATE conversations
      SET last_message = trim(p_text), last_message_at = now(), archived_a = NULL
      WHERE id = p_conversation_id;
    END IF;

    SELECT role INTO other_role FROM profiles WHERE id = other_participant;
    recently_read := CASE
      WHEN conv.user_a_id = other_participant
        THEN conv.read_at_a > now() - interval '2 minutes'
      ELSE conv.read_at_b > now() - interval '2 minutes'
    END;

    other_messages_path := CASE other_role
      WHEN 'teacher' THEN '/teacher/messages'
      WHEN 'admin' THEN '/admin/messages'
      ELSE '/student/messages'
    END;

    IF NOT COALESCE(recently_read, false) THEN
      INSERT INTO notifications (school_id, recipient_id, actor_id, type, title, body, link)
      VALUES (conv.school_id, other_participant, me, 'message', my_name, trim(p_text),
              other_messages_path || '?with=' || me);
    END IF;

    RETURN new_id;
  END IF;

  -- ---------------- group path -------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = conv.id AND profile_id = me
  ) THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;

  INSERT INTO chat_messages (conversation_id, from_id, from_name, text)
  VALUES (conv.id, me, my_name, trim(p_text))
  RETURNING id INTO new_id;

  UPDATE conversations
  SET last_message = trim(p_text), last_message_at = now()
  WHERE id = conv.id;

  -- Sender has obviously read the thread up to now.
  UPDATE conversation_members
  SET read_at = now(), archived_at = NULL
  WHERE conversation_id = conv.id AND profile_id = me;

  -- Fan-out: notify every OTHER member (role-aware deep link), skipping
  -- members who read in the last 2 minutes or block the sender either way.
  FOR member IN
    SELECT m.profile_id, m.read_at FROM conversation_members m
    WHERE m.conversation_id = conv.id AND m.profile_id <> me
  LOOP
    IF EXISTS (
      SELECT 1 FROM chat_blocks
      WHERE (blocker_id = me AND blocked_id = member.profile_id)
         OR (blocker_id = member.profile_id AND blocked_id = me)
    ) THEN
      CONTINUE;
    END IF;
    IF member.read_at > now() - interval '2 minutes' THEN
      CONTINUE;
    END IF;

    SELECT role INTO member_role FROM profiles WHERE id = member.profile_id;
    member_path := CASE member_role
      WHEN 'teacher' THEN '/teacher/messages'
      WHEN 'admin' THEN '/admin/messages'
      ELSE '/student/messages'
    END;

    INSERT INTO notifications (school_id, recipient_id, actor_id, type, title, body, link)
    VALUES (conv.school_id, member.profile_id, me, 'message', my_name, trim(p_text),
            member_path || '?with=' || conv.id);
  END LOOP;

  RETURN new_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) Per-member state helpers - group-aware branches.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_conversation_read(p_conversation_id UUID, p_read BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID;
  conv conversations%ROWTYPE;
BEGIN
  SELECT id INTO me FROM profiles WHERE user_id = auth.uid();
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO conv FROM conversations WHERE id = p_conversation_id;
  IF conv.id IS NULL THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;

  IF NOT conv.is_group THEN
    IF conv.user_a_id <> me AND conv.user_b_id <> me THEN
      RAISE EXCEPTION 'Not a participant of this conversation';
    END IF;
    IF conv.user_a_id = me THEN
      UPDATE conversations
      SET read_at_a = CASE WHEN p_read THEN now() ELSE NULL END
      WHERE id = conv.id;
    ELSE
      UPDATE conversations
      SET read_at_b = CASE WHEN p_read THEN now() ELSE NULL END
      WHERE id = conv.id;
    END IF;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = conv.id AND profile_id = me
  ) THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;

  UPDATE conversation_members
  SET read_at = CASE WHEN p_read THEN now() ELSE NULL END
  WHERE conversation_id = conv.id AND profile_id = me;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_conversation_archived(p_conversation_id UUID, p_archived BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID;
  conv conversations%ROWTYPE;
BEGIN
  SELECT id INTO me FROM profiles WHERE user_id = auth.uid();
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO conv FROM conversations WHERE id = p_conversation_id;
  IF conv.id IS NULL THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;

  IF NOT conv.is_group THEN
    IF conv.user_a_id <> me AND conv.user_b_id <> me THEN
      RAISE EXCEPTION 'Not a participant of this conversation';
    END IF;
    IF conv.user_a_id = me THEN
      UPDATE conversations
      SET archived_a = CASE WHEN p_archived THEN now() ELSE NULL END
      WHERE id = conv.id;
    ELSE
      UPDATE conversations
      SET archived_b = CASE WHEN p_archived THEN now() ELSE NULL END
      WHERE id = conv.id;
    END IF;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = conv.id AND profile_id = me
  ) THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;

  UPDATE conversation_members
  SET archived_at = CASE WHEN p_archived THEN now() ELSE NULL END
  WHERE conversation_id = conv.id AND profile_id = me;
END;
$$;

-- deleted_at doubles as the history cutoff (same semantics as the pairs).
CREATE OR REPLACE FUNCTION public.delete_conversation(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID;
  conv conversations%ROWTYPE;
BEGIN
  SELECT id INTO me FROM profiles WHERE user_id = auth.uid();
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO conv FROM conversations WHERE id = p_conversation_id;
  IF conv.id IS NULL THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;

  IF NOT conv.is_group THEN
    IF conv.user_a_id <> me AND conv.user_b_id <> me THEN
      RAISE EXCEPTION 'Not a participant of this conversation';
    END IF;
    IF conv.user_a_id = me THEN
      UPDATE conversations SET deleted_a = now() WHERE id = conv.id;
    ELSE
      UPDATE conversations SET deleted_b = now() WHERE id = conv.id;
    END IF;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = conv.id AND profile_id = me
  ) THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;

  UPDATE conversation_members
  SET deleted_at = now()
  WHERE conversation_id = conv.id AND profile_id = me;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9) get_unread_counts - group-aware.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_unread_counts()
RETURNS TABLE(conversation_id UUID, unread BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Classic pairs.
  RETURN QUERY
  SELECT c.id, count(m.id)::BIGINT
  FROM conversations c
  JOIN chat_messages m ON m.conversation_id = c.id
  WHERE c.is_group = false
    AND c.user_a_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND (c.read_at_a IS NULL OR m.created_at > c.read_at_a)
    AND (c.deleted_a IS NULL OR m.created_at > c.deleted_a)
  GROUP BY c.id;

  RETURN QUERY
  SELECT c.id, count(m.id)::BIGINT
  FROM conversations c
  JOIN chat_messages m ON m.conversation_id = c.id
  WHERE c.is_group = false
    AND c.user_b_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND (c.read_at_b IS NULL OR m.created_at > c.read_at_b)
    AND (c.deleted_b IS NULL OR m.created_at > c.deleted_b)
  GROUP BY c.id;

  -- Groups (per-member read_at).
  RETURN QUERY
  SELECT c.id, count(m.id)::BIGINT
  FROM conversations c
  JOIN conversation_members mem ON mem.conversation_id = c.id
  JOIN chat_messages m ON m.conversation_id = c.id
  WHERE c.is_group = true
    AND mem.profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND m.from_id <> mem.profile_id
    AND (mem.read_at IS NULL OR m.created_at > mem.read_at)
    AND (mem.deleted_at IS NULL OR m.created_at > mem.deleted_at)
  GROUP BY c.id;
END;
$$;
