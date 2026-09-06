"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useChatStore, ChatRole } from "@/lib/chatStore";
import { useSchoolProfiles } from "@/lib/useSchoolProfiles";
import { useMyProfile } from "@/lib/useMyProfile";
import type { ProfileRow } from "@/types/supabase";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useOnline } from "@/lib/useOnline";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { registerBackHandler } from "@/lib/nativeBackHandler";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const upd = () => setIsMobile(mq.matches);
    upd();
    mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, []);
  return isMobile;
}

const ROLE_LABEL: Record<string, string> = {
  student: "Student",
  teacher: "Teacher",
  admin: "Admin",
};

const TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "groups", label: "Groups" },
  { key: "direct", label: "Direct" },
] as const;

type TypeFilter = (typeof TYPE_FILTERS)[number]["key"];

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function PlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function ChevronRightIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function personSubtitle(person: ProfileRow) {
  return (
    ROLE_LABEL[person.role] ?? person.role
  ) + (person.role === "student"
    ? ` · ${[person.educational_level, person.level_label].filter(Boolean).join(" · ")}`
    : "");
}

function formatTime(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function MessengerView({ role: _role }: { role: ChatRole }) {
  const searchParams = useSearchParams();
  const withId = searchParams.get("with");
  const { profile: me } = useMyProfile();
  const {
    conversations,
    archivedConversations,
    loading,
    error,
    blocks,
    ensureConversation,
    sendMessage,
    openConversation,
    archiveConversation,
    unarchiveConversation,
    hideConversation,
    markUnread,
    blockUser,
    unblockUser,
    createGroup,
    addGroupMembers,
    leaveGroup,
  } = useChatStore();
  const { profiles: people, loading: peopleLoading } = useSchoolProfiles();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [dialogQuery, setDialogQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState<"hide" | "block" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<Set<string>>(new Set());
  const [addingMembers, setAddingMembers] = useState(false);
  const openingWith = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageCountRef = useRef(0);
  const isMobile = useIsMobile();
  const isOnline = useOnline();

  const list = showArchived ? archivedConversations : conversations;

  // Open the most recent conversation once loaded (when not deep-linked).
  // On mobile keep the list visible - don't auto-open a convo.
  useEffect(() => {
    if (!activeId && list.length > 0 && !withId && !isMobile) {
      const first = list[0];
      setActiveId(first.id);
      openConversation(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length, withId, isMobile]);

  // ?with=<profileId> - create/find the conversation and open it. The ref
  // guards against StrictMode double-invoking this effect (which previously
  // raced ensure_conversation into duplicate rows).
  useEffect(() => {
    if (!withId) return;
    if (openingWith.current === withId) return;
    openingWith.current = withId;
    setActionError(null);
    ensureConversation(withId).then((id) => {
      openingWith.current = null;
      if (id) {
        setActiveId(id);
        setShowArchived(false);
        openConversation(id);
      } else {
        setActionError("Couldn't start a conversation with that person. They may have blocked you or the chat is unavailable.");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withId]);

  // Escape closes the conversation options menu and the new-chat dialog; on
  // Capacitor Android the hardware back button closes the dialog too (same
  // contract as the shared Modal).
  useEffect(() => {
    if (!menuOpen && !newChatOpen && !creatingGroup && !addingMembers) return;
    const closeAll = () => {
      setMenuOpen(false);
      setNewChatOpen(false);
      setCreatingGroup(false);
      setAddingMembers(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    window.addEventListener("keydown", onKey);
    const unregisterBack =
      newChatOpen || menuOpen || creatingGroup || addingMembers
        ? registerBackHandler(() => {
            closeAll();
            return true;
          })
        : null;
    return () => {
      window.removeEventListener("keydown", onKey);
      unregisterBack?.();
    };
  }, [menuOpen, newChatOpen, creatingGroup, addingMembers]);

  async function handleCreateGroup() {
    const title = groupTitle.trim();
    if (!title || groupMemberIds.size === 0) return;
    const id = await createGroup(title, [...groupMemberIds]);
    if (id) {
      setCreatingGroup(false);
      setGroupTitle("");
      setGroupMemberIds(new Set());
      setActiveId(id);
      setShowArchived(false);
      await openConversation(id);
    } else {
      setActionError("Couldn't create the group. Check the name and members, then try again.");
    }
  }

  const active =
    list.find((c) => c.id === activeId) ??
    conversations.find((c) => c.id === activeId) ??
    archivedConversations.find((c) => c.id === activeId) ??
    null;
  const isBlocked = active ? blocks.has(active.otherId) : false;

  // Scroll to the newest message on conversation switch and whenever the
  // thread grows - never on unrelated re-renders, so the view stays stable
  // while typing.
  useEffect(() => {
    messageCountRef.current = -1;
  }, [activeId]);
  useEffect(() => {
    const count = active?.messages.length ?? 0;
    if (count !== messageCountRef.current) {
      messageCountRef.current = count;
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, active?.messages.length]);

  // Group threads don't exist in the data model yet (conversations are strict
  // 1:1 pairs), so the Groups tab intentionally lists nothing for now.
  const matchesType = (key: TypeFilter) => key !== "groups";

  const filteredConversations = useMemo(
    () =>
      list.filter(
        (c) =>
          matchesType(typeFilter) &&
          (c.name.toLowerCase().includes(query.toLowerCase()) ||
            (c.lastMessage ?? "").toLowerCase().includes(query.toLowerCase()))
      ),
    [list, query, typeFilter]
  );

  const personResults = useMemo(() => {
    const normalized = dialogQuery.toLowerCase();
    return (people ?? [])
      .filter((p) => p.id !== me?.id)
      .filter((p) => p.full_name.toLowerCase().includes(normalized))
      .filter((p) => !blocks.has(p.id))
      .slice(0, 50);
  }, [people, dialogQuery, me, blocks]);

  const personResultsInline = useMemo(() => {
    if (!query.trim()) return [];
    const normalized = query.toLowerCase();
    return (people ?? [])
      .filter((p) => p.id !== me?.id)
      .filter((p) => p.full_name.toLowerCase().includes(normalized))
      .filter((p) => !blocks.has(p.id))
      .slice(0, 8);
  }, [people, query, me, blocks]);

  const showingPeople = query.trim().length > 0 && personResultsInline.length > 0;

  const segmentValue = showArchived ? "archived" : typeFilter;
  function setSegment(value: "all" | "groups" | "archived") {
    if (value === "archived") {
      setShowArchived(true);
      // Archived is its own view - a stale Groups filter would make the
      // archived list permanently empty, so the type chips reset to All.
      setTypeFilter("all");
      return;
    }
    setShowArchived(false);
    setTypeFilter(value);
  }

  async function handleSelect(id: string) {
    setActionError(null);
    setMenuOpen(false);
    setActiveId(id);
    // Keep the archived view mounted: the fallbacks on `active` resolve
    // archived conversations too, so the thread opens in place and its
    // options menu (with "Move to inbox") stays reachable.
    await openConversation(id);
  }

  async function handleStartConversation(person: ProfileRow) {
    setActionError(null);
    setQuery("");
    setDialogQuery("");
    setNewChatOpen(false);
    const id = await ensureConversation(person.id);
    if (id) {
      setActiveId(id);
      await openConversation(id);
    } else {
      setActionError(`Couldn't message ${person.full_name}. They may have blocked you.`);
    }
  }

  async function handleSend() {
    if (!active || !draft.trim() || sending || isBlocked) return;
    if (!isOnline) {
      setActionError("You’re offline - connect to send messages. Your draft is still here.");
      return;
    }
    setSending(true);
    const ok = await sendMessage(active.id, draft);
    setSending(false);
    if (ok) setDraft("");
    else if (!navigator.onLine) setActionError("You’re offline - message wasn’t sent.");
    else setActionError("Message couldn't be sent - try again.");
  }

  return (
    <div className="flex h-[calc(100vh-220px)] max-h-[calc(100dvh-140px)] min-h-[400px] overflow-hidden rounded-[10px] border border-base max-[767px]:h-[calc(100dvh-140px)] max-[767px]:min-h-[400px] md:min-h-[520px] md:h-[calc(100vh-220px)]">
      {/* Left column: conversation list / search */}
      <div
        className={`relative flex shrink-0 flex-col border-base max-[767px]:w-full max-[767px]:border-r-0 md:w-[304px] md:max-w-[304px] md:border-r ${isMobile ? (active ? "hidden" : "flex w-full") : "flex w-full max-w-[304px]"}`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-base p-4 max-[767px]:px-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-navy">Messages</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSegment(showArchived ? "all" : "archived")}
              className={`hidden rounded-full px-3 py-1 text-[11px] font-semibold transition md:block ${
                showArchived ? "bg-[var(--surface-strong)] text-navy" : "text-muted hover:bg-[var(--surface-strong)] hover:text-navy"
              }`}
            >
              {showArchived ? "Inbox" : `Archived${archivedConversations.length > 0 ? ` (${archivedConversations.length})` : ""}`}
            </button>
            <button
              type="button"
              onClick={() => setNewChatOpen(true)}
              aria-label="New chat"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-[var(--surface-strong)] hover:text-navy"
            >
              <PlusIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 p-3 pb-2 max-[767px]:pt-4">
          <div className="inline-flex items-center gap-0.5 rounded-full border border-base p-[3px]">
            {(["all", "groups", "archived"] as const).map((seg) => (
              <button
                key={seg}
                type="button"
                onClick={() => setSegment(seg)}
                className={`rounded-full px-3 py-[3px] text-[11px] capitalize transition ${
                  segmentValue === seg
                    ? "bg-[var(--surface-strong)] font-semibold text-navy"
                    : "font-medium text-muted hover:text-navy"
                }`}
              >
                {seg}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 pt-1">
          <div className="flex items-center gap-2 rounded-full border border-base bg-surface px-4 py-2">
            <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people or chats..."
              className="w-full bg-transparent text-sm text-navy placeholder:text-muted outline-none"
            />
          </div>
        </div>

        {!showArchived && (
          <div className="flex gap-2 px-4 pb-3">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setTypeFilter(f.key)}
                className={`flex-1 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  typeFilter === f.key
                    ? "bg-accent-token text-on-accent"
                    : "text-muted hover:bg-[var(--surface-strong)] hover:text-navy"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-4 text-sm text-muted">Loading conversations...</p>
          ) : error ? (
            <p className="p-4 text-sm text-warn">{error}</p>
          ) : showingPeople ? (
            <div className="py-2">
              <p className="px-4 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">People</p>
              {personResultsInline.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => handleStartConversation(person)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--surface-strong)]"
                >
                  <UserAvatar name={person.full_name} src={person.avatar_url} size="md" profileId={person.id} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy">{person.full_name}</p>
                    <p className="truncate text-[11px] text-muted">{personSubtitle(person)}</p>
                  </div>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-faint" />
                </button>
              ))}
            </div>
          ) : query.trim() && filteredConversations.length === 0 ? (
            <p className="p-4 text-sm text-muted">No people or chats match “{query}”.</p>
          ) : filteredConversations.length === 0 ? (
            <p className="p-4 text-sm text-muted">
              {typeFilter === "groups"
                ? "No group chats yet."
                : showArchived
                  ? "No archived conversations."
                  : "No conversations yet - tap + to start chatting."}
            </p>
          ) : (
            filteredConversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelect(c.id)}
                className={`flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left transition ${
                  activeId === c.id ? "bg-[var(--surface-strong)]" : "hover:bg-[var(--surface-strong)]"
                }`}
              >
                {c.isGroup ? (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-base bg-[var(--surface-strong)] text-muted">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </span>
                ) : (
                  <UserAvatar name={c.name} src={c.avatarUrl} size="lg" profileId={c.otherId} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-navy">{c.name}</p>
                    <span className="shrink-0 text-[10px] text-muted">{formatTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted">{c.lastMessage || "No messages yet"}</p>
                    {c.unread > 0 && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-token text-[10px] font-bold text-on-accent">
                        {c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {isMobile && !active && (
          <button
            type="button"
            onClick={() => setNewChatOpen(true)}
            aria-label="New chat"
            className="absolute bottom-5 right-5 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-accent-token text-on-accent shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition active:scale-95"
          >
            <PlusIcon className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Right column: conversation */}
      <div
        className={`min-w-0 flex-1 flex-col ${isMobile ? (active ? "flex" : "hidden") : "flex"} ${isMobile && active ? "w-full" : ""}`}
      >
        {active ? (
          <>
            <div className="flex items-center gap-3 border-b border-base p-4">
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setActiveId(null)}
                  aria-label="Back to conversations"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-[var(--surface-strong)] hover:text-navy md:hidden"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5" />
                    <path d="M12 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              {active.isGroup ? (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-base bg-[var(--surface-strong)] text-muted">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </span>
              ) : (
                <UserAvatar name={active.name} src={active.avatarUrl} size="lg" profileId={active.otherId} />
              )}
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold text-navy">{active.name}</p>
                {active.isGroup ? (
                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted">
                    Group · {active.members.length} member{active.members.length === 1 ? "" : "s"}
                  </p>
                ) : active.otherId && (
                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted">
                    {ROLE_LABEL[active.otherRole] ?? active.otherRole}
                    {isBlocked ? " · Blocked" : ""}
                  </p>
                )}
              </div>
              {(active.isGroup || active.otherId) && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-label="Conversation options"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-[var(--surface-strong)] hover:text-navy"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="5" cy="12" r="1.8" />
                      <circle cx="12" cy="12" r="1.8" />
                      <circle cx="19" cy="12" r="1.8" />
                    </svg>
                  </button>
                  {menuOpen && (
                    <>
                      <button type="button" aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuOpen(false)} />
                      <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-2xl border border-base bg-surface py-1.5 shadow-xl">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setMenuOpen(false); markUnread(active.id); }}
                          className="flex w-full items-center px-4 py-2 text-left text-[13px] text-navy transition hover:bg-[var(--surface-strong)]"
                        >
                          Mark as unread
                        </button>
                        {active.archived || showArchived ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => { setMenuOpen(false); unarchiveConversation(active.id); }}
                            className="flex w-full items-center px-4 py-2 text-left text-[13px] text-navy transition hover:bg-[var(--surface-strong)]"
                          >
                            Move to inbox
                          </button>
                        ) : (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => { setMenuOpen(false); archiveConversation(active.id); setActiveId(null); }}
                            className="flex w-full items-center px-4 py-2 text-left text-[13px] text-navy transition hover:bg-[var(--surface-strong)]"
                          >
                            Archive
                          </button>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            setConfirming("hide");
                          }}
                          className="flex w-full items-center px-4 py-2 text-left text-[13px] text-warn transition hover:bg-[var(--surface-strong)]"
                        >
                          {active.isGroup ? "Delete group for me" : "Delete conversation"}
                        </button>
                        <div className="my-1 border-t border-base" />
                        {active.isGroup ? (
                          <>
                            {active.isOwner && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setMenuOpen(false);
                                  setAddingMembers(true);
                                }}
                                className="flex w-full items-center px-4 py-2 text-left text-[13px] text-navy transition hover:bg-[var(--surface-strong)]"
                              >
                                Add members
                              </button>
                            )}
                            <button
                              type="button"
                              role="menuitem"
                              onClick={async () => {
                                setMenuOpen(false);
                                const err = await leaveGroup(active.id);
                                if (err) setActionError(err);
                                else setActiveId(null);
                              }}
                              className="flex w-full items-center px-4 py-2 text-left text-[13px] text-warn transition hover:bg-[var(--surface-strong)]"
                            >
                              Leave group
                            </button>
                          </>
                        ) : isBlocked ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => { setMenuOpen(false); unblockUser(active.otherId); }}
                            className="flex w-full items-center px-4 py-2 text-left text-[13px] text-navy transition hover:bg-[var(--surface-strong)]"
                          >
                            Unblock {active.name.split(" ")[0]}
                          </button>
                        ) : (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuOpen(false);
                              setConfirming("block");
                            }}
                            className="flex w-full items-center px-4 py-2 text-left text-[13px] text-warn transition hover:bg-[var(--surface-strong)]"
                          >
                            Block {active.name.split(" ")[0]}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-5">
              {actionError && <p className="rounded-[10px] border border-warn-soft bg-warn-soft px-3 py-2 text-xs text-warn">{actionError}</p>}
              {active.messagesLoading ? (
                <p className="text-center text-sm text-muted">Loading messages...</p>
              ) : active.messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-token">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                  </span>
                  <p className="text-sm font-semibold text-navy">No messages yet</p>
                  <p className="text-xs text-muted">
                    {active.isGroup
                      ? `Start the conversation in ${active.name}.`
                      : `Say hi to ${active.name.split(" ")[0]} - the conversation starts here.`}
                  </p>
                </div>
              ) : (
                (() => {
                  // Insert a day separator whenever the day changes.
                  let lastDay: string | null = null;
                  const rows: React.ReactNode[] = [];
                  active.messages.forEach((m) => {
                    const day = new Date(m.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    if (day !== lastDay) {
                      lastDay = day;
                      const isToday =
                        new Date(m.createdAt).toDateString() === new Date().toDateString();
                      rows.push(
                        <div key={`day-${m.id}`} className="flex items-center justify-center gap-3 py-1">
                          <span className="h-px w-8 bg-[var(--border)]" />
                          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-faint">
                            {isToday ? "Today" : day}
                          </span>
                          <span className="h-px w-8 bg-[var(--border)]" />
                        </div>
                      );
                    }
                    rows.push(
                      <div key={m.id} className={`flex flex-col ${m.mine ? "items-end" : "items-start"}`}>
                        {active.isGroup && !m.mine && (
                          <span className="mb-0.5 px-1 text-[10.5px] font-semibold text-muted">{m.fromName}</span>
                        )}
                        <span
                          className={`max-w-[72%] whitespace-pre-wrap break-words rounded-[14px] px-4 py-2.5 text-sm leading-[1.625] ${
                            m.mine
                              ? "rounded-bl-[4px] bg-accent-token text-on-accent"
                              : "rounded-br-[4px] bg-[var(--surface-strong)] text-navy"
                          }`}
                        >
                          {m.text}
                          <span
                            className={`ml-3 inline-block translate-y-[2px] text-[10px] font-medium tabular-nums ${
                              m.mine ? "text-on-accent/60" : "text-faint"
                            }`}
                          >
                            {new Date(m.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </span>
                      </div>
                    );
                  });
                  return rows;
                })()
              )}
            </div>

            <div className="border-t border-base p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-[767px]:pb-[max(1rem,env(safe-area-inset-bottom))]">
              {!isOnline && <OfflineBanner message="You’re offline - messages need a connection. Your draft is saved." />}
              {isBlocked ? (
                <p className="rounded-full border border-warn-soft bg-warn-soft px-4 py-2.5 text-center text-xs font-semibold text-warn">
                  You&apos;ve blocked this user - unblock them to send messages.
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Type a message..."
                    className="min-w-0 flex-1 rounded-full border border-base bg-surface px-4 py-2.5 text-sm text-navy outline-none focus:border-accent"
                    enterKeyHint="send"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !draft.trim()}
                    aria-label="Send message"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy text-white transition hover:bg-accent-token hover:text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? (
                      <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 2L11 13" />
                        <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            {peopleLoading ? (
              <p className="text-sm text-muted">Loading directory...</p>
            ) : (
              <>
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent-token">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
                  </svg>
                </span>
                <p className="text-sm font-semibold text-navy">Select a conversation</p>
                <p className="max-w-xs text-xs text-muted">
                  Search for a student, teacher, or admin in the sidebar, or pick an existing chat to keep talking.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* New chat dialog: full-screen on mobile, centered modal on desktop */}
      {newChatOpen && (
        <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setNewChatOpen(false)} role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="New chat"
            onClick={(e) => e.stopPropagation()}
            className={
              isMobile
                ? "absolute inset-0 flex flex-col bg-surface pb-[env(safe-area-inset-bottom)]"
                : "absolute left-1/2 top-1/2 flex max-h-[80vh] w-[480px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-2xl border border-base bg-surface p-5 shadow-xl"
            }
          >
            <div className="flex min-h-8 items-center justify-between gap-3 p-4 md:p-0">
              {isMobile ? (
                <button
                  type="button"
                  onClick={() => setNewChatOpen(false)}
                  aria-label="Back to conversations"
                  className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-[var(--surface-strong)] hover:text-navy"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5" />
                    <path d="M12 19l-7-7 7-7" />
                  </svg>
                </button>
              ) : (
                <span />
              )}
              <p className="text-base font-semibold text-navy">New chat</p>
              {isMobile ? (
                <span className="h-9 w-9" />
              ) : (
                <button
                  type="button"
                  onClick={() => setNewChatOpen(false)}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--border)] text-navy transition hover:opacity-80"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
            </div>

            <div className="p-4 pt-0 md:p-0">
              <div className="flex h-[38px] items-center gap-2 rounded-full border border-base bg-[var(--bg)] px-4">
                <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
                <input
                  value={dialogQuery}
                  onChange={(e) => setDialogQuery(e.target.value)}
                  placeholder="Search people..."
                  autoFocus={!isMobile}
                  className="w-full bg-transparent text-sm text-navy placeholder:text-muted outline-none"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
              <button
                type="button"
                onClick={() => {
                  setNewChatOpen(false);
                  setCreatingGroup(true);
                }}
                className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--surface-strong)] md:rounded-[10px]"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-token text-on-accent">
                  <PlusIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[14px] font-semibold text-navy">New group</span>
                  <span className="mt-0.5 block text-[11px] text-muted">Start a group with classmates or teachers</span>
                </span>
                <ChevronRightIcon className="h-5 w-5 shrink-0 text-faint" />
              </button>
              <p className="px-4 pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-faint md:px-4">People</p>
              {peopleLoading ? (
                <p className="px-4 py-3 text-sm text-muted">Loading directory...</p>
              ) : personResults.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted">
                  {dialogQuery.trim() ? `No people match “${dialogQuery}”.` : "No one to message yet."}
                </p>
              ) : (
                personResults.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => handleStartConversation(person)}
                    className="flex min-h-[44px] w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--surface-strong)]"
                  >
                    <UserAvatar name={person.full_name} src={person.avatar_url} size="lg" profileId={person.id} />
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="truncate text-[13px] font-semibold text-navy">{person.full_name}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted">{personSubtitle(person)}</p>
                    </div>
                    <ChevronRightIcon className="h-5 w-5 shrink-0 text-faint" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create group dialog: name + member picker */}
      {creatingGroup && (
        <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setCreatingGroup(false)} role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="New group"
            onClick={(e) => e.stopPropagation()}
            className={
              isMobile
                ? "absolute inset-0 flex flex-col bg-surface pb-[env(safe-area-inset-bottom)]"
                : "absolute left-1/2 top-1/2 flex max-h-[80vh] w-[480px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-2xl border border-base bg-surface p-5 shadow-xl"
            }
          >
            <div className="flex min-h-8 items-center justify-between gap-3 p-4 md:p-0">
              {isMobile ? (
                <button
                  type="button"
                  onClick={() => setCreatingGroup(false)}
                  aria-label="Back"
                  className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-[var(--surface-strong)] hover:text-navy"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5" />
                    <path d="M12 19l-7-7 7-7" />
                  </svg>
                </button>
              ) : (
                <span />
              )}
              <p className="text-base font-semibold text-navy">New group</p>
              {isMobile ? (
                <span className="h-9 w-9" />
              ) : (
                <button
                  type="button"
                  onClick={() => setCreatingGroup(false)}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--border)] text-navy transition hover:opacity-80"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
            </div>

            <div className="space-y-3 p-4 pt-0 md:p-0">
              <input
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="Group name"
                maxLength={60}
                className="h-[38px] w-full rounded-full border border-base bg-[var(--bg)] px-4 text-sm text-navy placeholder:text-muted outline-none focus:border-accent"
              />
              <div className="flex h-[38px] items-center gap-2 rounded-full border border-base bg-[var(--bg)] px-4">
                <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
                <input
                  value={dialogQuery}
                  onChange={(e) => setDialogQuery(e.target.value)}
                  placeholder="Search members..."
                  className="w-full bg-transparent text-sm text-navy placeholder:text-muted outline-none"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
              <p className="px-4 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-faint md:px-4">
                Members ({groupMemberIds.size} selected)
              </p>
              {peopleLoading ? (
                <p className="px-4 py-3 text-sm text-muted">Loading directory...</p>
              ) : personResults.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted">
                  {dialogQuery.trim() ? `No people match “${dialogQuery}”.` : "No one available."}
                </p>
              ) : (
                personResults.map((person) => {
                  const checked = groupMemberIds.has(person.id);
                  return (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() =>
                        setGroupMemberIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(person.id)) next.delete(person.id);
                          else next.add(person.id);
                          return next;
                        })
                      }
                      className="flex min-h-[44px] w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--surface-strong)]"
                    >
                      <UserAvatar name={person.full_name} src={person.avatar_url} size="md" profileId={person.id} />
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate text-[13px] font-semibold text-navy">{person.full_name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted">{personSubtitle(person)}</p>
                      </div>
                      <span
                        aria-hidden
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                          checked ? "border-accent-token bg-accent-token text-on-accent" : "border-base"
                        }`}
                      >
                        {checked && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t border-base p-4 md:border-0 md:p-0">
              <button
                type="button"
                onClick={handleCreateGroup}
                disabled={!groupTitle.trim() || groupMemberIds.size === 0}
                className="w-full rounded-full bg-navy py-2.5 text-sm font-semibold text-white transition hover-bg-accent-token hover-text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add members dialog (group owner only) */}
      {addingMembers && active?.isGroup && (
        <AddMembersDialog
          existing={new Set(active.members.map((m) => m.id))}
          onClose={() => setAddingMembers(false)}
          onConfirm={async (ids) => {
            const err = await addGroupMembers(active.id, ids);
            setAddingMembers(false);
            if (err) setActionError(err);
          }}
        />
      )}

      {confirming && active && (
        <Modal
          onClose={() => setConfirming(null)}
          eyebrow={confirming === "hide" ? "Delete conversation" : "Block user"}
          description={confirming === "hide" ? `Hide \"${active.name}\"?` : `Block ${active.name}?`}
        >
          <p className="mt-2 text-sm leading-6 text-muted">
            {confirming === "hide"
              ? "This removes the conversation from your inbox. The other person keeps their copy."
              : "You won't receive messages from them and they can't message you. You can unblock anytime."}
          </p>
          <div className="mt-5 flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => {
                if (confirming === "hide") {
                  hideConversation(active.id);
                  setActiveId(null);
                } else {
                  blockUser(active.otherId);
                }
                setConfirming(null);
              }}
            >
              {confirming === "hide" ? "Delete conversation" : "Block"}
            </Button>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AddMembersDialog({
  existing,
  onClose,
  onConfirm,
}: {
  existing: Set<string>;
  onClose: () => void;
  onConfirm: (ids: string[]) => Promise<void>;
}) {
  const { profiles: people, loading } = useSchoolProfiles();
  const { profile: me } = useMyProfile();
  const { blocks } = useChatStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const candidates = (people ?? [])
    .filter((p) => p.id !== me?.id)
    .filter((p) => !existing.has(p.id))
    .filter((p) => !blocks.has(p.id));

  return (
    <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add members"
        onClick={(e) => e.stopPropagation()}
        className="absolute left-1/2 top-1/2 flex max-h-[80vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-base bg-surface p-5 shadow-xl"
      >
        <p className="text-base font-semibold text-navy">Add members</p>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-4 py-3 text-sm text-muted">Loading directory...</p>
          ) : candidates.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">Everyone is already in the group.</p>
          ) : (
            candidates.map((person) => {
              const checked = selected.has(person.id);
              return (
                <button
                  key={person.id}
                  type="button"
                  onClick={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(person.id)) next.delete(person.id);
                      else next.add(person.id);
                      return next;
                    })
                  }
                  className="flex min-h-[44px] w-full items-center gap-3 px-1 py-2.5 text-left transition hover:bg-[var(--surface-strong)]"
                >
                  <UserAvatar name={person.full_name} src={person.avatar_url} size="md" profileId={person.id} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-navy">{person.full_name}</p>
                    <p className="truncate text-[11px] text-muted">{personSubtitle(person)}</p>
                  </div>
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                      checked ? "border-accent-token bg-accent-token text-on-accent" : "border-base"
                    }`}
                  >
                    {checked && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => void onConfirm([...selected])}
            className="flex-1 rounded-full bg-navy py-2.5 text-sm font-semibold text-white transition hover-bg-accent-token hover-text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-base py-2.5 text-sm font-semibold text-navy transition hover:border-accent"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
