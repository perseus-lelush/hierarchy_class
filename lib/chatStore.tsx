"use client";

import { createContext, useContext, useEffect, useCallback, useMemo, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useMyProfile } from "@/lib/useMyProfile";

export type ChatRole = "student" | "teacher" | "admin";

export interface ChatMessage {
  id: string;
  fromId: string | null;
  fromName: string;
  text: string;
  createdAt: string;
  mine: boolean;
}

export interface Conversation {
  id: string;
  otherId: string;
  otherRole: ChatRole;
  name: string;
  avatarUrl: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastReadAt: string | null;
  archived: boolean;
  messages: ChatMessage[];
  messagesLoading: boolean;
  unread: number;
  /** Group chats: isGroup=true, members holds the roster. */
  isGroup: boolean;
  members: ConversationMember[];
  /** Only set on groups I created - enables "Add members". */
  isOwner: boolean;
}

export interface ConversationMember {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  role: ChatRole;
}

interface ChatContextValue {
  conversations: Conversation[];
  archivedConversations: Conversation[];
  loading: boolean;
  error: string | null;
  blocks: Set<string>;
  /** Creates or finds the shared thread with another profile and returns its id. */
  ensureConversation: (otherProfileId: string) => Promise<string | null>;
  sendMessage: (conversationId: string, text: string) => Promise<boolean>;
  /** Marks my side read and loads message history. */
  openConversation: (conversationId: string) => Promise<void>;
  archiveConversation: (conversationId: string) => Promise<void>;
  unarchiveConversation: (conversationId: string) => Promise<void>;
  hideConversation: (conversationId: string) => Promise<void>;
  markUnread: (conversationId: string) => Promise<void>;
  blockUser: (otherProfileId: string) => Promise<void>;
  unblockUser: (otherProfileId: string) => Promise<void>;
  /** Creates a group chat and returns its conversation id (null on failure). */
  createGroup: (title: string, memberIds: string[]) => Promise<string | null>;
  /** Group owner adds members. Resolves an error string or null. */
  addGroupMembers: (conversationId: string, memberIds: string[]) => Promise<string | null>;
  /** Any member can leave a group. Resolves an error string or null. */
  leaveGroup: (conversationId: string) => Promise<string | null>;
  refetch: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

interface ConversationRow {
  id: string;
  user_a_id: string;
  user_b_id: string | null;
  role_a: string;
  role_b: string | null;
  is_group?: boolean;
  title?: string | null;
  created_by?: string | null;
  members?: {
    profile_id: string;
    deleted_at?: string | null;
    profiles: { id: string; full_name: string; avatar_url: string | null; role: string };
  }[];
  last_message: string | null;
  last_message_at: string | null;
  read_at_a: string | null;
  read_at_b: string | null;
  archived_a: string | null;
  archived_b: string | null;
  deleted_a: string | null;
  deleted_b: string | null;
  a?: { id: string; full_name: string; avatar_url: string | null; role: string } | null;
  b?: { id: string; full_name: string; avatar_url: string | null; role: string } | null;
}

function toMessage(m: any, myProfileId: string): ChatMessage {
  return {
    id: m.id,
    fromId: m.from_id,
    fromName: m.from_name,
    text: m.text,
    createdAt: m.created_at,
    mine: m.from_id === myProfileId,
  };
}

function toConversation(row: ConversationRow, myProfileId: string, unread: number): Conversation {
  const isGroup = !!row.is_group;
  const iAmA = row.user_a_id === myProfileId;
  const other = iAmA ? row.b : row.a;
  const cutoff = myCutoff(row, myProfileId);
  // After I deleted this thread, the SHARED last_message column is stale for
  // me until real new activity revives the thread (last_message_at > cutoff).
  // Rows in the inbox list already passed isVisible() so they're unaffected;
  // this guard fixes direct fetches (ensure_conversation) that re-add a
  // deleted thread and would otherwise show the old message + old timestamp.
  const stalePreview = !!cutoff && (!row.last_message_at || row.last_message_at <= cutoff);
  const members: ConversationMember[] = isGroup
    ? (row.members ?? []).map((m) => ({
        id: m.profile_id,
        fullName: m.profiles?.full_name ?? "Member",
        avatarUrl: m.profiles?.avatar_url ?? null,
        role: (m.profiles?.role ?? "student") as ChatRole,
      }))
    : [];
  return {
    id: row.id,
    otherId: iAmA ? (row.user_b_id ?? "") : row.user_a_id,
    otherRole: ((iAmA ? row.role_b : row.role_a) ?? other?.role ?? "student") as ChatRole,
    name: isGroup ? (row.title ?? "Group") : (other?.full_name ?? "Unknown"),
    avatarUrl: isGroup ? null : (other?.avatar_url ?? null),
    lastMessage: stalePreview ? null : row.last_message,
    lastMessageAt: stalePreview ? null : row.last_message_at,
    lastReadAt: iAmA ? row.read_at_a : row.read_at_b,
    archived: !!(iAmA ? row.archived_a : row.archived_b),
    messages: [],
    messagesLoading: false,
    unread,
    isGroup,
    members,
    isOwner: isGroup ? row.created_by === myProfileId : false,
  };
}

/** My side's history cutoff: my deleted_at column (pairs) or member row
 *  (groups) - messages older than it stay hidden even after the thread
 *  revives with new activity. */
function myCutoff(row: ConversationRow, myProfileId: string): string | null {
  if (row.is_group) {
    return row.members?.find((m) => m.profile_id === myProfileId)?.deleted_at ?? null;
  }
  return row.user_a_id === myProfileId ? row.deleted_a : row.deleted_b;
}

/** A thread is in my inbox unless I deleted it and nothing has happened since. */
function isVisible(row: ConversationRow, myProfileId: string): boolean {
  const cutoff = myCutoff(row, myProfileId);
  if (!cutoff) return true;
  return !!row.last_message_at && row.last_message_at > cutoff;
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useMyProfile();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchTick, setRefetchTick] = useState(0);
  const [blocks, setBlocks] = useState<Set<string>>(new Set());
  const activeConversation = useRef<string | null>(null);
  const seenMessageIds = useRef<Set<string>>(new Set());
  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;

  const supabaseConfigured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const refetch = useCallback(() => setRefetchTick((t) => t + 1), []);

  // Load my threads + unread counts + my blocks in one effect.
  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      setError("Supabase isn't configured yet.");
      return;
    }
    if (!profile) return;

    let cancelled = false;
    const myProfileId = profile.id;
    const supabase = createClient();

    async function loadAll() {
      // PostgREST cannot reference an embedded table's column inside a
      // top-level or() filter ("conversation_members.profile_id.eq.X" fails
      // to parse), so group membership is resolved in its own query and the
      // two result sets are merged.
      const [convRes, groupIdsRes, unreadRes, blockRes] = await Promise.all([
        supabase
          .from("conversations")
          .select(
            "*, a:profiles!user_a_id(id, full_name, avatar_url, role), b:profiles!user_b_id(id, full_name, avatar_url, role)"
          )
          .or(`user_a_id.eq.${myProfileId},user_b_id.eq.${myProfileId}`),
        supabase
          .from("conversation_members")
          .select("conversation_id")
          .eq("profile_id", myProfileId),
        (supabase as any).rpc("get_unread_counts"),
        supabase.from("chat_blocks").select("blocked_id"),
      ]);

      if (cancelled) return;

      if (convRes.error) {
        setError("Couldn't load conversations.");
        setLoading(false);
        return;
      }

      let rows = ((convRes.data ?? []) as ConversationRow[]);
      const groupIds = ((groupIdsRes.data ?? []) as { conversation_id: string }[]).map(
        (r) => r.conversation_id
      );
      // Groups where I'm a member but not the user_a/user_b pair column.
      const missingGroupIds = groupIds.filter(
        (id) => !rows.some((r) => r.id === id)
      );
      if (missingGroupIds.length > 0) {
        const { data: groupRows } = await supabase
          .from("conversations")
          .select(
            "*, a:profiles!user_a_id(id, full_name, avatar_url, role), b:profiles!user_b_id(id, full_name, avatar_url, role), members:conversation_members(profile_id, deleted_at, profiles(id, full_name, avatar_url, role))"
          )
          .in("id", missingGroupIds);
        if (cancelled) return;
        rows = [...rows, ...(((groupRows ?? []) as unknown) as ConversationRow[])];
      }
      // Groups always carry the members embed; ensure pair rows do not.
      rows = rows.map((r) =>
        r.is_group
          ? { ...r, members: r.members ?? [] }
          : r
      );

      const unreadByConv: Record<string, number> = {};
      ((unreadRes.data ?? []) as any[]).forEach((u: any) => {
        unreadByConv[u.conversation_id] = Number(u.unread) || 0;
      });

      const visibleRows = rows
        .filter((r) => isVisible(r, myProfileId))
        .sort((a, b) =>
          (b.last_message_at || b.last_message || "").localeCompare(a.last_message_at || a.last_message || "")
        );

      setConversations(visibleRows.map((r) => toConversation(r, myProfileId, unreadByConv[r.id] ?? 0)));
      setBlocks(new Set(((blockRes.data ?? []) as any[]).map((b: any) => b.blocked_id)));
      setError(null);
      setLoading(false);
    }

    loadAll();

    // Blocks can change while the messenger is open (block/unblock).
    const channel = supabase
      .channel("chat-blocks-mine")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_blocks" },
        () => {
          if (cancelled) return;
          supabase
            .from("chat_blocks")
            .select("blocked_id")
            .then(({ data }) => {
              if (!cancelled && data) {
                setBlocks(new Set((data as any[]).map((b: any) => b.blocked_id)));
              }
            });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseConfigured, profile, refetchTick]);

  // Realtime: incoming messages. One filter-less channel - RLS scopes the
  // events to threads I participate in, so there is nothing to re-create as
  // the list grows. Our own sends are appended by sendMessage, so echoes of
  // my own messages are ignored here to keep exactly one copy per message.
  useEffect(() => {
    if (!supabaseConfigured || !profile) return;
    const supabase = createClient();
    const myProfileId = profile.id;

    const channel = supabase
      .channel("chat-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const msg = payload.new as any;
          if (!msg) return;
          if (msg.from_id === myProfileId) return;
          if (seenMessageIds.current.has(msg.id)) return;
          seenMessageIds.current.add(msg.id);

          // A message for a thread we don't have in state (deleted on our
          // side, or created on another device) - refetch; if it revived, the
          // thread reappears with only post-cutoff messages.
          if (!conversationsRef.current.some((c) => c.id === msg.conversation_id)) {
            setRefetchTick((t) => t + 1);
            return;
          }

          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.id === msg.conversation_id);
            if (idx === -1) return prev;
            const conv = prev[idx];
            const already = conv.messages.some((m) => m.id === msg.id);
            if (already) return prev;
            const isActive = activeConversation.current === conv.id;
            const updated = {
              ...conv,
              lastMessage: msg.text,
              lastMessageAt: msg.created_at,
            };
            if (isActive) updated.messages = [...conv.messages, toMessage(msg, myProfileId)];
            else updated.unread = conv.unread + 1;
            const next = [...prev];
            next[idx] = updated;
            next.sort((a, b) =>
              (b.lastMessageAt || b.lastReadAt || "").localeCompare(a.lastMessageAt || a.lastReadAt || "")
            );
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseConfigured, profile]);

  const ensureConversation = useCallback(
    async (otherProfileId: string): Promise<string | null> => {
      if (!profile) return null;
      const existing = conversations.find((c) => c.otherId === otherProfileId);
      if (existing) return existing.id;

      const supabase = createClient();
      const { data, error: rpcError } = await (supabase as any).rpc("ensure_conversation", {
        p_other_user_id: otherProfileId,
      });
      if (rpcError) return null;
      const convId = data as string;

      // Fetch the fresh row so it appears immediately.
      const { data: fresh } = await supabase
        .from("conversations")
        .select(
          "*, a:profiles!user_a_id(id, full_name, avatar_url, role), b:profiles!user_b_id(id, full_name, avatar_url, role)"
        )
        .eq("id", convId)
        .single();
      if (fresh) {
        setConversations((prev) => {
          const conv = toConversation(fresh as ConversationRow, profile.id, 0);
          const idx = prev.findIndex((c) => c.id === convId);
          if (idx === -1) return [conv, ...prev];
          const next = [...prev];
          next[idx] = { ...next[idx], ...conv, messages: next[idx].messages };
          return next;
        });
      } else {
        refetch();
      }
      return convId;
    },
    [profile, conversations, refetch]
  );

  const sendMessage = useCallback(
    async (conversationId: string, text: string): Promise<boolean> => {
      if (!profile) return false;
      const supabase = createClient();
      const { data, error: sendError } = await (supabase as any).rpc("send_chat_message", {
        p_conversation_id: conversationId,
        p_text: text,
      });
      if (sendError) return false;

      const messageId = data as string;
      // The RPC committed the row - append exactly one copy (the realtime
      // echo of our own message is filtered above by from_id).
      const msg: ChatMessage = {
        id: messageId,
        fromId: profile.id,
        fromName: profile.full_name,
        text,
        createdAt: new Date().toISOString(),
        mine: true,
      };
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conversationId);
        if (idx === -1) return prev;
        const conv = prev[idx];
        const already = conv.messages.some((m) => m.id === messageId);
        const updated = { ...conv, lastMessage: text, lastMessageAt: new Date().toISOString() };
        updated.messages = already ? conv.messages : [...conv.messages, msg];
        const next = [...prev];
        next[idx] = updated;
        next.sort((a, b) =>
          (b.lastMessageAt || b.lastReadAt || "").localeCompare(a.lastMessageAt || a.lastReadAt || "")
        );
        return next;
      });

      // The other participant's notification (with a link straight into the
      // thread) is created inside the send_chat_message DB function - never
      // client-side, so it also fires when the sender's tab is closed. The
      // old client-side notifyUser call with the broken "/messages" link was
      // removed to avoid duplicate notifications.
      return true;
    },
    [profile]
  );

  const openConversation = useCallback(
    async (conversationId: string) => {
      if (!profile) return;
      activeConversation.current = conversationId;
      const myProfileId = profile.id;
      const supabase = createClient();

      // Mark my side read (DB-backed so it survives reloads).
      await (supabase as any).rpc("set_conversation_read", {
        p_conversation_id: conversationId,
        p_read: true,
      });

      const { data, error: messagesError } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(200);

      // A transient failure must not wipe the open thread's history - keep
      // whatever messages are already in state and just stop the spinner.
      if (messagesError) {
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, messagesLoading: false } : c))
        );
        return;
      }

      // Find my history cutoff: if I deleted this thread, only messages newer
      // than that count - a deleted thread behaves like a fresh one for me.
      const { data: row } = await supabase
        .from("conversations")
        .select(
          "id, user_a_id, user_b_id, role_a, role_b, is_group, title, created_by, last_message, last_message_at, read_at_a, read_at_b, archived_a, archived_b, deleted_a, deleted_b, a:profiles!user_a_id(id, full_name, avatar_url, role), b:profiles!user_b_id(id, full_name, avatar_url, role), members:conversation_members(profile_id, deleted_at, profiles(id, full_name, avatar_url, role))"
        )
        .eq("id", conversationId)
        .single();

      const cutoff = row ? myCutoff(row as ConversationRow, myProfileId) : null;
      const allMessages = (((data ?? []) as any[]).map((m: any) => toMessage(m, myProfileId)) as ChatMessage[]);
      const messages = cutoff ? allMessages.filter((m) => m.createdAt > cutoff) : allMessages;
      messages.forEach((m) => seenMessageIds.current.add(m.id));

      // The list preview must match what the thread actually shows: for a
      // thread I deleted, the shared last_message column can hold a pre-delete
      // message, so derive the preview from the visible messages instead.
      const lastVisible = messages[messages.length - 1] ?? null;

      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conversationId);
        if (!exists) {
          const r = row as ConversationRow | null;
          if (!r) return prev;
          return [
            {
              ...toConversation(r, myProfileId, 0),
              messages,
              messagesLoading: false,
              lastMessage: lastVisible ? lastVisible.text : null,
              lastMessageAt: lastVisible ? lastVisible.createdAt : null,
              lastReadAt: new Date().toISOString(),
            },
            ...prev,
          ];
        }
        return prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages,
                messagesLoading: false,
                // Derive the preview from the messages actually visible to me -
                // never from the shared column: a deleted thread re-opened with
                // no post-delete messages must show nothing, not the old text.
                lastMessage: lastVisible ? lastVisible.text : null,
                lastMessageAt: lastVisible ? lastVisible.createdAt : null,
                unread: 0,
                lastReadAt: new Date().toISOString(),
              }
            : c
        );
      });

    },
    [profile]
  );

  /** These mutate MY side of the shared thread only - the other user's read /
   *  archive state and the messages themselves are untouched. */
  const archiveConversation = useCallback(
    async (conversationId: string) => {
      if (!profile) return;
      const supabase = createClient();
      await (supabase as any).rpc("set_conversation_archived", {
        p_conversation_id: conversationId,
        p_archived: true,
      });
      setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, archived: true } : c)));
    },
    [profile]
  );

  const unarchiveConversation = useCallback(
    async (conversationId: string) => {
      if (!profile) return;
      const supabase = createClient();
      await (supabase as any).rpc("set_conversation_archived", {
        p_conversation_id: conversationId,
        p_archived: false,
      });
      setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, archived: false } : c)));
    },
    [profile]
  );

  const hideConversation = useCallback(
    async (conversationId: string) => {
      if (!profile) return;
      const supabase = createClient();
      const { error } = await (supabase as any).rpc("delete_conversation", {
        p_conversation_id: conversationId,
      });
      // If the server rejected the delete, keep the thread visible - hiding it
      // locally while the row is untouched would make it "ghost" back later.
      if (error) return;
      // Remove from my inbox. My history cutoff is set server-side, so if the
      // thread revives later it comes back without the old messages.
      if (activeConversation.current === conversationId) activeConversation.current = null;
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    },
    [profile]
  );

  const markUnread = useCallback(
    async (conversationId: string) => {
      if (!profile) return;
      const supabase = createClient();
      await (supabase as any).rpc("set_conversation_read", {
        p_conversation_id: conversationId,
        p_read: false,
      });
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, lastReadAt: null, unread: c.messages.filter((m) => !m.mine).length }
            : c
        )
      );
    },
    [profile]
  );

  const blockUser = useCallback(
    async (otherProfileId: string) => {
      if (!profile) return;
      const supabase = createClient();
      const { error } = await supabase
        .from("chat_blocks")
        .insert({ blocker_id: profile.id, blocked_id: otherProfileId } as any);
      // Only reflect the block locally when the row actually landed - an
      // optimistic add on failure shows a "blocked" state that isn't real.
      if (!error) {
        setBlocks((prev) => new Set(prev).add(otherProfileId));
      }
    },
    [profile]
  );

  const unblockUser = useCallback(
    async (otherProfileId: string) => {
      if (!profile) return;
      const supabase = createClient();
      await supabase.from("chat_blocks").delete().eq("blocker_id", profile.id).eq("blocked_id", otherProfileId);
      setBlocks((prev) => {
        const next = new Set(prev);
        next.delete(otherProfileId);
        return next;
      });
    },
    [profile]
  );

  const createGroup = useCallback(
    async (title: string, memberIds: string[]): Promise<string | null> => {
      if (!profile) return null;
      const supabase = createClient();
      const { data, error } = await (supabase as any).rpc("create_chat_group", {
        p_title: title,
        p_member_ids: memberIds,
      });
      if (error) {
        console.error("[chat] createGroup failed:", error.message);
        return null;
      }
      refetch();
      return (data as string) ?? null;
    },
    [profile, refetch]
  );

  const addGroupMembers = useCallback(
    async (conversationId: string, memberIds: string[]): Promise<string | null> => {
      if (!profile) return "You're not signed in.";
      const supabase = createClient();
      const { error } = await (supabase as any).rpc("add_chat_group_members", {
        p_conversation_id: conversationId,
        p_member_ids: memberIds,
      });
      if (error) {
        console.error("[chat] addGroupMembers failed:", error.message);
        return error.message || "Couldn't add members.";
      }
      refetch();
      return null;
    },
    [profile, refetch]
  );

  const leaveGroup = useCallback(
    async (conversationId: string): Promise<string | null> => {
      if (!profile) return "You're not signed in.";
      const supabase = createClient();
      const { error } = await (supabase as any).rpc("leave_chat_group", {
        p_conversation_id: conversationId,
      });
      if (error) {
        console.error("[chat] leaveGroup failed:", error.message);
        return error.message || "Couldn't leave the group.";
      }
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      return null;
    },
    [profile]
  );

  const archived = useMemo(() => conversations.filter((c) => c.archived), [conversations]);
  const active = useMemo(() => conversations.filter((c) => !c.archived), [conversations]);

  const value = useMemo(
    () => ({
      conversations: active,
      archivedConversations: archived,
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
      refetch,
    }),
    [
      active,
      archived,
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
      refetch,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatStore() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatStore must be used within ChatProvider");
  return ctx;
}
