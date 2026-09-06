"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFriendsStore, type Friend } from "@/lib/friendsStore";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { InlineLoader } from "@/components/ui/Loading";

/**
 * "See All" friends view for the student profile - doubles as the FRIEND
 * MANAGER (#1 beta fix): every row carries an unfriend button (with
 * confirmation), and rows navigate to the Android-safe
 * /student/profile/view?id= route.
 *
 * The friends store already loads the full list once, so there is no extra
 * network cost on open. Paginated in view so the DOM never renders an
 * endlessly growing list even for a large friend set.
 */

const PAGE = 20;

export function FriendsModal({ onClose }: { onClose: () => void }) {
  const { friends, loading, error } = useFriendsStore();
  const router = useRouter();
  const [visible, setVisible] = useState(PAGE);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Reset pagination when the list length changes (a friend was added/removed).
  useEffect(() => {
    setVisible(PAGE);
  }, [friends.length]);

  const visibleFriends = friends.slice(0, visible);
  const openProfile = (id: string) => {
    onClose();
    router.push(`/student/profile/view?id=${id}`);
  };
  const removing = friends.find((f) => f.id === removingId) ?? null;

  return (
    <Modal eyebrow="Friends" description="Everyone you're connected with" onClose={onClose} ariaLabel="Friends">
      {loading ? (
        <InlineLoader label="Loading friends..." className="py-6" />
      ) : error ? (
        <p className="mt-4 text-sm text-warn">{error}</p>
      ) : friends.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No friends yet.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-1">
            {visibleFriends.map((friend) => (
              <div
                key={friend.id}
                className="flex items-center gap-3 rounded-[10px] border border-base bg-surface px-3 py-2.5 transition hover:border-accent"
              >
                <button
                  type="button"
                  onClick={() => openProfile(friend.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <UserAvatar name={friend.fullName} src={friend.avatarUrl} size="md" profileId={friend.id} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-navy">{friend.fullName}</span>
                    {friend.levelLabel && <span className="block truncate text-xs text-muted">{friend.levelLabel}</span>}
                  </span>
                  <span className="text-faint">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setRemovingId(friend.id)}
                  aria-label={`Remove ${friend.fullName}`}
                  title={`Remove ${friend.fullName}`}
                  className="shrink-0 rounded-full border border-base p-1.5 text-muted transition hover-border-warn-soft hover-text-warn"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          {friends.length > visible && (
            <button
              type="button"
              onClick={() => setVisible((c) => c + PAGE)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-[10px] border border-base bg-surface py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-navy transition hover:border-accent-soft"
            >
              Load More ({visible} of {friends.length})
            </button>
          )}
        </>
      )}

      {removing && <RemoveFriendConfirm friend={removing} onClose={() => setRemovingId(null)} />}
    </Modal>
  );
}

function RemoveFriendConfirm({ friend, onClose }: { friend: Friend; onClose: () => void }) {
  const { removeFriend } = useFriendsStore();
  const [busy, setBusy] = useState(false);

  return (
    <Modal onClose={onClose} eyebrow="Remove friend" description={`Remove ${friend.fullName}?`}>
      <p className="mt-2 text-sm leading-6 text-muted">
        You&apos;ll no longer see each other in your friends list. You can always add them back.
      </p>
      <div className="mt-5 flex gap-2">
        <Button
          variant="danger"
          className="flex-1"
          loading={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              await removeFriend(friend.id);
              setBusy(false);
              onClose();
            })();
          }}
        >
          Remove friend
        </Button>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
