"use client";

/**
 * 1:1 voice calls (#4 beta feature) over WebRTC, signaled through Supabase
 * Realtime broadcast channels - no extra backend needed.
 *
 * Security model: the callee listens on a personal ring channel
 * `call-user:<profileId>` (unguessable UUID). Accepting moves both peers onto
 * a random capability channel `call:<callId>` that only the ring payload
 * revealed - outsiders cannot discover or join it. Broadcast payloads are
 * only SDP/ICE metadata; media never touches the server (peer-to-peer DTLS).
 *
 * Limits (documented in docs/ARCHITECTURE): audio-only, one active call,
 * STUN-only NAT traversal (no TURN relay) - works for typical home/school
 * NATs, may fail on very restrictive networks, which surfaces as a call
 * error rather than a hang.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useMyProfile } from "@/lib/useMyProfile";
import { randomId } from "@/lib/randomId";

export type CallStatus = "idle" | "calling" | "incoming" | "connecting" | "active" | "ended";

export interface CallPeer {
  id: string;
  name: string;
}

interface CallContextValue {
  status: CallStatus;
  peer: CallPeer | null;
  muted: boolean;
  durationSec: number;
  error: string | null;
  /** Start an audio call to another profile (1:1 only). */
  startCall: (peer: CallPeer) => void;
  acceptCall: () => void;
  declineCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  clearEnded: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

const ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
const RING_TIMEOUT_MS = 30_000;

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useMyProfile();

  const [status, setStatus] = useState<CallStatus>("idle");
  const [peer, setPeer] = useState<CallPeer | null>(null);
  const [muted, setMuted] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const ringChannelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const callIdRef = useRef<string | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<CallStatus>("idle");
  statusRef.current = status;
  const peerRef = useRef<CallPeer | null>(null);
  peerRef.current = peer;

  /** Safely tear the whole call stack down. */
  const teardown = useCallback((opts?: { notifyPeer?: boolean }) => {
    if (opts?.notifyPeer && callIdRef.current) {
      try {
        channelRef.current?.send({
          type: "broadcast",
          event: "signal",
          payload: { kind: "end", callId: callIdRef.current },
        });
      } catch {
        /* peer may already be gone */
      }
    }
    ringTimeoutRef.current && clearTimeout(ringTimeoutRef.current);
    durationTimerRef.current && clearInterval(durationTimerRef.current);
    if (ringChannelRef.current) {
      createClient().removeChannel(ringChannelRef.current);
      ringChannelRef.current = null;
    }
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    channelRef.current && createClient().removeChannel(channelRef.current);
    channelRef.current = null;
    callIdRef.current = null;
    pendingIceRef.current = [];
    setMuted(false);
    setDurationSec(0);
  }, []);

  const endCall = useCallback(() => {
    const hadPeer = peerRef.current;
    teardown({ notifyPeer: true });
    setStatus(hadPeer ? "ended" : "idle");
    setTimeout(() => {
      setStatus((s) => (s === "ended" ? "idle" : s));
    }, 1500);
  }, [teardown]);

  const fail = useCallback(
    (message: string) => {
      teardown({ notifyPeer: true });
      setError(message);
      setStatus("ended");
      setTimeout(() => {
        setStatus((s) => (s === "ended" ? "idle" : s));
        setError(null);
      }, 2500);
    },
    [teardown]
  );

  /** Creates the RTCPeerConnection with local mic audio attached. */
  const buildPeer = useCallback(async (callId: string, channelId: string) => {
    const supabase = createClient();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "signal",
          payload: { kind: "ice", callId, candidate: event.candidate.toJSON() },
        });
      }
    };
    pc.ontrack = (event) => {
      if (!remoteAudioRef.current) {
        remoteAudioRef.current = new Audio();
        remoteAudioRef.current.autoplay = true;
      }
      remoteAudioRef.current.srcObject = event.streams[0];
      void remoteAudioRef.current.play().catch(() => {
        /* autoplay guard - user interacted to start the call */
      });
    };

    const channel = supabase.channel(channelId);
    channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      const data = payload as { kind: string; callId: string; [k: string]: unknown };
      if (data.callId !== callId) return;

      // CALLER: the callee accepted - start negotiation by sending the offer.
      // (Without this the call never progresses past "connecting".)
      if (data.kind === "accept" && statusRef.current === "calling") {
        void (async () => {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          setStatus("connecting");
          channelRef.current?.send({
            type: "broadcast",
            event: "signal",
            payload: { kind: "offer", callId, sdp: offer },
          });
        })().catch(() => fail("Couldn't connect the call."));
        return;
      }

      if (data.kind === "offer" && statusRef.current === "connecting") {
        void (async () => {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as RTCSessionDescriptionInit));
          setStatus("active");
          durationTimerRef.current = setInterval(() => setDurationSec((s) => s + 1), 1000);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          channelRef.current?.send({
            type: "broadcast",
            event: "signal",
            payload: { kind: "answer", callId, sdp: answer },
          });
          for (const candidate of pendingIceRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          pendingIceRef.current = [];
        })().catch(() => fail("Couldn't connect the call."));
        return;
      }

      if (data.kind === "answer" && statusRef.current === "connecting") {
        void (async () => {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as RTCSessionDescriptionInit));
          setStatus("active");
          durationTimerRef.current = setInterval(() => setDurationSec((s) => s + 1), 1000);
          for (const candidate of pendingIceRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          pendingIceRef.current = [];
        })().catch(() => fail("Couldn't connect the call."));
        return;
      }

      if (data.kind === "ice" && pcRef.current) {
        const candidate = data.candidate as RTCIceCandidateInit;
        if (pc.remoteDescription) {
          void pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
        } else {
          pendingIceRef.current.push(candidate);
        }
        return;
      }

      if (data.kind === "end") {
        const hadPeer = peerRef.current;
        teardown();
        setStatus(hadPeer ? "ended" : "idle");
        setTimeout(() => setStatus((s) => (s === "ended" ? "idle" : s)), 1500);
      }
    });
    channel.subscribe();
    channelRef.current = channel;
    return channel;
  }, [fail, teardown]);

  /** Caller: ring, wait for accept, negotiate. */
  const startCall = useCallback(
    (target: CallPeer) => {
      if (statusRef.current !== "idle" && statusRef.current !== "ended") return;
      setPeer(target);
      setError(null);
      setStatus("calling");

      const callId = randomId();
      callIdRef.current = callId;
      const channelId = `call:${callId}`;

      ringTimeoutRef.current = setTimeout(() => {
        if (statusRef.current === "calling") {
          fail(`${target.name.split(" ")[0]} didn't answer.`);
        }
      }, RING_TIMEOUT_MS);

      void (async () => {
        // Build the capability channel + mic FIRST so accept can negotiate
        // immediately, then ring the callee on THEIR personal channel - the
        // callee has no way to know call:{callId} until the ring arrives.
        await buildPeer(callId, channelId);
        const supabase = createClient();
        const ringChannel = supabase.channel(`call-user:${target.id}`);
        ringChannelRef.current = ringChannel;
        ringChannel.subscribe((state) => {
          if (state !== "SUBSCRIBED") return;
          ringChannel.send({
            type: "broadcast",
            event: "signal",
            payload: { kind: "ring", callId, from: profile?.id, fromName: profile?.full_name, channelId },
          });
        });
      })().catch(() => fail("Couldn't access your microphone."));
    },
    [profile, buildPeer, fail]
  );

  // Callee: listen for rings on my personal channel while idle.
  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    const ringChannel = supabase.channel(`call-user:${profile.id}`);
    ringChannel
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        const data = payload as { kind: string; callId: string; fromName: string; channelId: string };
        if (data.kind !== "ring") return;
        if (statusRef.current !== "idle" && statusRef.current !== "ended") return;
        callIdRef.current = data.callId;
        setPeer({ id: data.callId, name: data.fromName });
        setStatus("incoming");
        // Stash the capability channel id for accept.
        pendingRingRef.current = data.channelId;
        ringTimeoutRef.current = setTimeout(() => {
          setStatus((s) => (s === "incoming" ? "idle" : s));
          setPeer(null);
        }, RING_TIMEOUT_MS);
      })
      .subscribe();
    ringChannelRef.current = ringChannel;
    return () => {
      if (ringChannelRef.current) {
        supabase.removeChannel(ringChannelRef.current);
        ringChannelRef.current = null;
      }
    };
  }, [profile]);

  const pendingRingRef = useRef<string | null>(null);

  /** Callee accepts: join the capability channel, then negotiate as answerer. */
  const acceptCall = useCallback(() => {
    const channelId = pendingRingRef.current;
    const callId = callIdRef.current;
    if (!channelId || !callId) return;
    ringTimeoutRef.current && clearTimeout(ringTimeoutRef.current);
    setStatus("connecting");
    void (async () => {
      await buildPeer(callId, channelId);
      channelRef.current?.send({
        type: "broadcast",
        event: "signal",
        payload: { kind: "accept", callId },
      });
    })().catch(() => fail("Couldn't access your microphone."));
  }, [buildPeer, fail]);

  /** Callee declines: tell the caller, tear down. */
  const declineCall = useCallback(() => {
    const callId = callIdRef.current;
    if (callId && pendingRingRef.current) {
      // Briefly open the capability channel just to deliver the decline.
      const supabase = createClient();
      const channel = supabase.channel(pendingRingRef.current);
      channel.subscribe(() => {
        channel.send({
          type: "broadcast",
          event: "signal",
          payload: { kind: "end", callId },
        });
        setTimeout(() => supabase.removeChannel(channel), 400);
      });
    }
    teardown();
    setStatus("idle");
    setPeer(null);
  }, [teardown]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const enabled = stream.getAudioTracks().some((t) => t.enabled);
    stream.getAudioTracks().forEach((t) => (t.enabled = !enabled));
    setMuted(enabled);
  }, []);

  const clearEnded = useCallback(() => {
    setStatus("idle");
    setPeer(null);
    setError(null);
  }, []);

  // Unmount safety: never leak the mic.
  useEffect(() => () => teardown(), [teardown]);

  const value = useMemo(
    () => ({
      status,
      peer,
      muted,
      durationSec,
      error,
      startCall,
      acceptCall,
      declineCall,
      endCall,
      toggleMute,
      clearEnded,
    }),
    [status, peer, muted, durationSec, error, startCall, acceptCall, declineCall, endCall, toggleMute, clearEnded]
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCallStore() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCallStore must be used within CallProvider");
  return ctx;
}
