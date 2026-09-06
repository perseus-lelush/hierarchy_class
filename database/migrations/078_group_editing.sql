-- ===========================================================================
-- 078_group_editing.sql (v1.31, beta feedback)
--
-- Group name + cover photo editing (owner only):
--   - conversations.cover_url: public URL of the group cover image (the
--     public "chat-covers" bucket). NULL = default group tile.
--   - update_chat_group(p_conversation_id, p_title, p_cover_url): owner-only
--     rename / cover set-clear, same validation as creation.
--   - public "chat-covers" bucket, paths {school_id}/{conversation_id}/{uuid}.ext
--     with school-read + member-write policies (members may upload; only the
--     owner can attach one via the RPC).
-- Idempotent per project convention.
-- ===========================================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS cover_url TEXT;

COMMENT ON COLUMN conversations.cover_url IS
  'Public URL of the group cover image (chat-covers bucket). NULL = default tile.';

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-covers', 'chat-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Same-school members can view covers; only conversation members may upload
-- into their own group folder; folder 1 = school, folder 2 = conversation.
CREATE POLICY "chat_covers_school_read" ON storage.objects FOR SELECT USING (
  bucket_id = 'chat-covers'
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
    AND p.school_id::text = (storage.foldername(name))[1]
  )
);
CREATE POLICY "chat_covers_member_write" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'chat-covers'
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
    AND p.school_id::text = (storage.foldername(name))[1]
    AND EXISTS (
      SELECT 1 FROM conversation_members m
      WHERE m.conversation_id::text = (storage.foldername(name))[2]
      AND m.profile_id = p.id
    )
  )
);

-- ---------------------------------------------------------------------------
-- update_chat_group: owner-only rename + cover set/clear.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_chat_group(
  p_conversation_id UUID,
  p_title TEXT,
  p_cover_url TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv conversations%ROWTYPE;
  me UUID;
  clean_title TEXT;
BEGIN
  SELECT * INTO conv FROM conversations WHERE id = p_conversation_id;
  IF conv.id IS NULL OR NOT conv.is_group THEN
    RAISE EXCEPTION 'Group conversation not found';
  END IF;

  SELECT id INTO me FROM profiles WHERE user_id = auth.uid();
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF conv.created_by <> me THEN
    RAISE EXCEPTION 'Only the group creator can edit it';
  END IF;

  clean_title := btrim(COALESCE(p_title, ''));
  IF length(clean_title) < 1 OR length(clean_title) > 80 THEN
    RAISE EXCEPTION 'Group name must be 1-80 characters';
  END IF;

  UPDATE conversations
  SET title = clean_title,
      cover_url = NULLIF(btrim(COALESCE(p_cover_url, '')), '')
  WHERE id = conv.id;
END;
$$;
