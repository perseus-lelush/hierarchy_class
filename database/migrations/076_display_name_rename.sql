-- ===========================================================================
-- 076_display_name_rename.sql (v1.30, beta feedback #4)
--
-- Users may rename their display name (first/middle/last + derived
-- full_name/initials) but only once every 30 days. The DB enforces the
-- cooldown, not the UI: profiles.name_changed_at records the last rename.
--
-- Rules:
--   - Renames are self-service only (own row). protect_profile_columns
--     already blocks self-edits of role/school_id/user_id - names are NOT
--     protected columns, so this migration adds a dedicated guard.
--   - Service role (developer provisioning / admin fixes) is exempt.
--   - first_name/last_name may not be blanked: at least one must remain.
--   - full_name and initials are re-derived from the new parts inside the
--     trigger, so they can never drift from first/middle/last.
-- Idempotent per project convention.
-- ===========================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS name_changed_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.name_changed_at IS
  'Timestamp of the last self-service display-name change. Renames allowed once per 30 days (enforced by guard_profile_name_change).';

-- ---------------------------------------------------------------------------
-- Guard trigger: 30-day cooldown + re-derive full_name/initials.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_name_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID;
  is_admin_fixed BOOLEAN;
BEGIN
  -- Nothing to do unless a name part actually changed.
  IF NEW.first_name IS NOT DISTINCT FROM OLD.first_name
     AND NEW.middle_name IS NOT DISTINCT FROM OLD.middle_name
     AND NEW.last_name IS NOT DISTINCT FROM OLD.last_name
     AND NEW.full_name IS NOT DISTINCT FROM OLD.full_name THEN
    RETURN NEW;
  END IF;

  SELECT id INTO me FROM profiles WHERE user_id = auth.uid();

  -- Service-role fixes and same-school admin corrections bypass the cooldown
  -- (admin fixes of official records). Everyone else is the row owner.
  is_admin_fixed := (auth.role() = 'service_role')
    OR (
      me IS NOT NULL AND me <> NEW.id AND NEW.school_id = (
        SELECT school_id FROM profiles WHERE id = me
      ) AND (
        SELECT role FROM profiles WHERE id = me
      ) IN ('admin', 'teacher')
    );

  IF NOT is_admin_fixed THEN
    IF me IS NULL OR me <> NEW.id THEN
      RAISE EXCEPTION 'You can only change your own name';
    END IF;

    IF OLD.name_changed_at IS NOT NULL
       AND OLD.name_changed_at > now() - interval '30 days' THEN
      RAISE EXCEPTION 'You can change your name again in % days',
        CEIL(EXTRACT(EPOCH FROM (OLD.name_changed_at + interval '30 days' - now())) / 86400)::int;
    END IF;

    NEW.name_changed_at := now();
  END IF;

  -- At least one real name part must remain (no fully blank profiles).
  IF COALESCE(btrim(NEW.first_name), '') = '' AND COALESCE(btrim(NEW.last_name), '') = '' THEN
    RAISE EXCEPTION 'Name cannot be empty';
  END IF;

  -- Re-derive display fields from the new parts so they can never drift.
  NEW.first_name := NULLIF(btrim(NEW.first_name), '');
  NEW.middle_name := NULLIF(btrim(NEW.middle_name), '');
  NEW.last_name := NULLIF(btrim(NEW.last_name), '');
  NEW.full_name := trim(concat_ws(' ', NEW.first_name, NEW.middle_name, NEW.last_name));
  NEW.initials := concat_ws(
    '',
    UPPER(LEFT(COALESCE(NEW.first_name, ''), 1)),
    UPPER(LEFT(COALESCE(NEW.last_name, ''), 1))
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_name_change ON profiles;
CREATE TRIGGER guard_profile_name_change
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_name_change();
