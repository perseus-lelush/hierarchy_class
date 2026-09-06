"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProfileRow } from "@/types/supabase";
import { createClient } from "@/lib/supabase/client";
import { validateUpload, extensionForMime, storagePathFromUrl } from "@/lib/uploadUtils";
import { randomId } from "@/lib/randomId";

interface UseMyProfileResult {
  profile: ProfileRow | null;
  loading: boolean;
  error: string | null;
  updateProfile: (
    patch: Partial<
      Pick<
        ProfileRow,
        | "bio"
        | "favorite_subject"
        | "hobbies"
        | "interests"
        | "profile_private"
        | "friends_private"
        | "history_private"
      >
    >
  ) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  removeAvatar: () => Promise<void>;
}

/** Fetches the profile row belonging to the currently logged in user. */
export function useMyProfile(): UseMyProfileResult {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchTick, setRefetchTick] = useState(0);

  const supabaseConfigured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      setError("Supabase isn't configured yet.");
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    supabase.auth
      .getUser()
      .then(async ({ data: userData, error: userError }) => {
        if (cancelled) return;
        if (userError || !userData.user) {
          setError("Not signed in.");
          setLoading(false);
          return;
        }

        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", userData.user.id)
          .single();

        if (cancelled) return;
        if (profileError || !data) {
          setError("Couldn't load your profile.");
          setProfile(null);
        } else {
          setProfile(data as ProfileRow);
          setError(null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load your profile.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [supabaseConfigured, refetchTick]);

  // Realtime: when this user's profile changes anywhere (their own edit, or
  // an admin updating their academic info/avatar), every open page that
  // renders the profile refreshes - nav bars, profile views, the monitor.
  // Filtered to this profile's row only (not the whole table). The channel
  // name must be unique PER MOUNT - this hook is used by several providers at
  // once, and a shared name would make the second subscriber attach its
  // listener to an already-subscribed channel (which throws).
  const profileId = profile?.id;
  useEffect(() => {
    if (!supabaseConfigured || !profileId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`my-profile-${randomId()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `id=eq.${profileId}` },
        () => setRefetchTick((t) => t + 1)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabaseConfigured, profileId]);

  const refetch = useCallback(() => setRefetchTick((t) => t + 1), []);

  const updateProfile = useCallback(
    async (
      patch: Partial<
        Pick<
          ProfileRow,
          | "bio"
          | "favorite_subject"
          | "hobbies"
          | "interests"
          | "profile_private"
          | "friends_private"
          | "history_private"
        >
      >
    ) => {
      if (!profile) return;
      const supabase = createClient();
      await (supabase.from("profiles") as any).update(patch).eq("id", profile.id);
      refetch();
    },
    [profile, refetch]
  );

  const uploadAvatar = useCallback(
    async (file: File) => {
      if (!profile) return;

      // Validate BEFORE touching storage: MIME whitelist, size cap, and the
      // extension is derived from the MIME type, never from the file name.
      const validationError = validateUpload(file, "image");
      if (validationError) {
        setError(validationError);
        return;
      }

      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;

      const ext = extensionForMime(file.type) ?? "jpg";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;

      const prevPath = profile.avatar_url ? storagePathFromUrl(profile.avatar_url, "avatars") : null;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: true });

      if (uploadError) {
        setError("Couldn't upload your profile picture.");
        return;
      }

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      // If the DB update fails, keep the old object: the profile still points
      // at it, so removing it would break the avatar image.
      const { error: updateError } = await (supabase
        .from("profiles") as any)
        .update({ avatar_url: avatarUrl })
        .eq("id", profile.id);
      if (updateError) {
        setError("Couldn't save your profile picture.");
        return;
      }

      // Remove the superseded image so no orphaned objects accumulate.
      if (prevPath && prevPath !== path) {
        await supabase.storage.from("avatars").remove([prevPath]);
      }

      setError(null);
      refetch();
    },
    [profile, refetch]
  );

  const removeAvatar = useCallback(async () => {
    if (!profile) return;
    const supabase = createClient();
    const prevPath = profile.avatar_url ? storagePathFromUrl(profile.avatar_url, "avatars") : null;
    await (supabase.from("profiles") as any).update({ avatar_url: null }).eq("id", profile.id);
    // Delete the stored object so the default avatar takes over with no
    // orphaned image left in storage.
    if (prevPath) {
      await supabase.storage.from("avatars").remove([prevPath]);
    }
    refetch();
  }, [profile, refetch]);

  return { profile, loading, error, updateProfile, uploadAvatar, removeAvatar };
}
