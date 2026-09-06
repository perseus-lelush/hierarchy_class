"use client";

/**
 * Shared add/remove-friend button with a confirmation step (#1 beta fix):
 * adding or removing a friend always asks first, and store errors are
 * surfaced instead of silently swallowed.
 *
 * Used by the search profile preview (ProfileModal), the full profile view
 * (ViewStudentProfile), and the friends manager (FriendsModal).
 */

import { useState } from "react";
import { useFriendsStore } from "@/lib/friendsStore";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export function FriendActionButton({
  targetId,
  targetName,
  isFriend,
  className = "",
  labels = { add: "Add Friend", remove: "Remove Friend" },
}: {
  targetId: string;
  targetName: string;
  isFriend: boolean;
  className?: string;
  labels?: { add: string; remove: string };
}) {
  const { addFriend, removeFriend } = useFriendsStore();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    const error =
      isFriend ? await removeFriend(targetId) : await addFriend(targetId, targetName);
    setBusy(false);
    setConfirming(false);
    if (error) {
      setErrorText(error);
      setTimeout(() => setErrorText(null), 4000);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={
          className ||
          `rounded-full px-4 py-2.5 text-sm font-semibold transition ${
            isFriend
              ? "border border-base bg-surface text-muted hover-border-warn-soft hover-text-warn"
              : "bg-accent text-on-accent hover:opacity-90"
          }`
        }
      >
        {errorText ? "Try again" : isFriend ? labels.remove : labels.add}
      </button>
      {errorText && <p className="text-xs text-warn">{errorText}</p>}
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          eyebrow={isFriend ? "Remove friend" : "Add friend"}
          description={isFriend ? `Remove ${targetName}?` : `Add ${targetName} as a friend?`}
        >
          <p className="mt-2 text-sm leading-6 text-muted">
            {isFriend
              ? "You'll no longer see each other in your friends list. You can always add them back."
              : "They'll appear in your friends list once added."}
          </p>
          <div className="mt-5 flex gap-2">
            <Button variant={isFriend ? "danger" : "accent"} className="flex-1" loading={busy} onClick={confirm}>
              {isFriend ? "Remove friend" : "Add friend"}
            </Button>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
