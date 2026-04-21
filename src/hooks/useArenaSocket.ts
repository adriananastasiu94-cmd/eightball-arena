"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { BallState, MatchState, ShotInput } from "@/game/types";

type QueueStatus = { inQueue: boolean; eta: number | null };
type PresencePayload = { userId: string; active: boolean; angle: number; power: number; t: number };
type ReplayPayload = { replayId: string; frames: BallState[][]; fps: number; durationMs: number };
type ReplayStartSignal = { replayId: string; durationMs: number; serverStartMs?: number; serverNowMs?: number };

export function useArenaSocket(enabled: boolean) {
  const [queue, setQueue] = useState<QueueStatus>({ inQueue: false, eta: null });
  const [selfUserId, setSelfUserId] = useState<string | null>(null);
  const [state, setState] = useState<MatchState | null>(null);
  const [matchFound, setMatchFound] = useState(false);
  const [result, setResult] = useState<{ winnerUserId: string | null; reason: string } | null>(null);
  const [replay, setReplay] = useState<{ id: string; frames: BallState[][]; fps: number; startAtMs?: number } | null>(
    null
  );
  const [isShotPending, setIsShotPending] = useState(false);
  const [shotError, setShotError] = useState<string | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [presenceByUser, setPresenceByUser] = useState<Record<string, PresencePayload>>({});
  const socketRef = useRef<Socket | null>(null);
  const lockTimerRef = useRef<number | null>(null);
  const shotPendingRef = useRef(false);
  const startedReplayIdsRef = useRef<Set<string>>(new Set());
  const replayPayloadByIdRef = useRef<Record<string, ReplayPayload>>({});
  const replayStartByIdRef = useRef<Record<string, ReplayStartSignal>>({});
  const lastCuePlaceRef = useRef<{ x: number; y: number; t: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const socket = io({
      path: process.env.NEXT_PUBLIC_SOCKET_PATH || "/socket.io",
      withCredentials: true,
      transports: ["websocket"]
    });

    socket.on("queue:status", setQueue);
    socket.on("session:ready", ({ userId }) => {
      if (typeof userId === "string" && userId.length > 0) {
        setSelfUserId(userId);
      }
    });
    socket.on("match:found", () => {
      setMatchFound(true);
      setResult(null);
      setShotError(null);
      setReplay(null);
      shotPendingRef.current = false;
      setIsShotPending(false);
      if (lockTimerRef.current !== null) {
        window.clearTimeout(lockTimerRef.current);
        lockTimerRef.current = null;
      }
      setPresenceByUser({});
      startedReplayIdsRef.current.clear();
      replayPayloadByIdRef.current = {};
      replayStartByIdRef.current = {};
      lastCuePlaceRef.current = null;
    });
    socket.on("match:state", ({ state: nextState, serverTime }) => {
      setState(nextState);
      if (typeof serverTime === "number") {
        const rawOffset = serverTime - Date.now();
        setServerOffsetMs(rawOffset);
      }
      if (!nextState.shotInProgress) {
        setReplay(null);
        replayPayloadByIdRef.current = {};
        replayStartByIdRef.current = {};
        shotPendingRef.current = false;
        setIsShotPending(false);
        if (lockTimerRef.current !== null) {
          window.clearTimeout(lockTimerRef.current);
          lockTimerRef.current = null;
        }
      }
    });
    const tryStartReplay = (replayId: string) => {
      if (startedReplayIdsRef.current.has(replayId)) return;
      const payload = replayPayloadByIdRef.current[replayId];
      const start = replayStartByIdRef.current[replayId];
      if (!payload || !start) return;
      startedReplayIdsRef.current.add(replayId);
      if (startedReplayIdsRef.current.size > 240) {
        startedReplayIdsRef.current.clear();
        startedReplayIdsRef.current.add(replayId);
      }

      let startupDelayMs = 0;
      if (typeof start.serverStartMs === "number" && typeof start.serverNowMs === "number") {
        const declaredLeadMs = start.serverStartMs - start.serverNowMs;
        startupDelayMs = Math.max(0, Math.min(220, Math.round(declaredLeadMs)));
      } else if (typeof start.serverStartMs === "number") {
        startupDelayMs = Math.max(0, Math.min(220, Math.round(start.serverStartMs - Date.now())));
      }
      const localStartAtMs = Date.now() + startupDelayMs;

      setReplay({
        id: replayId,
        frames: payload.frames,
        fps: payload.fps,
        startAtMs: localStartAtMs
      });
      setPresenceByUser((prev) => {
        const next: Record<string, PresencePayload> = {};
        for (const [userId, presence] of Object.entries(prev)) {
          next[userId] = { ...presence, active: false, t: Date.now() };
        }
        return next;
      });
      shotPendingRef.current = true;
      setIsShotPending(true);
      if (lockTimerRef.current !== null) window.clearTimeout(lockTimerRef.current);
      lockTimerRef.current = window.setTimeout(() => {
        shotPendingRef.current = false;
        setIsShotPending(false);
      }, startupDelayMs + payload.durationMs + 24);

      delete replayPayloadByIdRef.current[replayId];
      delete replayStartByIdRef.current[replayId];
    };

    socket.on("match:replay-payload", (payload) => {
      if (!payload || typeof payload.replayId !== "string") return;
      const durationMs =
        typeof payload.durationMs === "number"
          ? payload.durationMs
          : Math.max(300, Math.round((payload.frames.length / Math.max(1, payload.fps)) * 1000));
      replayPayloadByIdRef.current[payload.replayId] = {
        replayId: payload.replayId,
        frames: payload.frames,
        fps: payload.fps,
        durationMs
      };
      socket.emit("match:replay-ready", { replayId: payload.replayId });
      tryStartReplay(payload.replayId);
    });

    socket.on("match:replay-start", (startSignal) => {
      if (!startSignal || typeof startSignal.replayId !== "string") return;
      replayStartByIdRef.current[startSignal.replayId] = startSignal;
      tryStartReplay(startSignal.replayId);
    });
    socket.on("match:ended", (payload) => setResult(payload));
    socket.on("match:presence", (payload: PresencePayload) => {
      setPresenceByUser((prev) => ({
        ...prev,
        [payload.userId]: payload
      }));
    });
    socket.on("match:shot-rejected", (payload) => {
      setShotError(payload.reason);
      shotPendingRef.current = false;
      setIsShotPending(false);
    });

    socketRef.current = socket;

    return () => {
      if (lockTimerRef.current !== null) {
        window.clearTimeout(lockTimerRef.current);
        lockTimerRef.current = null;
      }
      socket.close();
      socketRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (!shotError) return;
    const id = window.setTimeout(() => setShotError(null), 2400);
    return () => window.clearTimeout(id);
  }, [shotError]);

  const api = useMemo(
    () => ({
      queue,
      selfUserId,
      state,
      matchFound,
      result,
      replay,
      shotError,
      serverOffsetMs,
      presenceByUser,
      shotLocked: isShotPending || Boolean(state?.shotInProgress),
      joinQueue: (stake?: number) => socketRef.current?.emit("queue:join", { stake }),
      leaveQueue: () => socketRef.current?.emit("queue:leave"),
      shoot: (shot: ShotInput) => {
        if (shotPendingRef.current || state?.shotInProgress) return;
        setShotError(null);
        shotPendingRef.current = true;
        setIsShotPending(true);
        socketRef.current?.emit("match:shot", shot);
      },
      placeCue: (x: number, y: number) => {
        const now = performance.now();
        const last = lastCuePlaceRef.current;
        if (last) {
          const dist = Math.hypot(x - last.x, y - last.y);
          const dt = now - last.t;
          if (dist < 0.75) return;
          if (dist < 2.8 && dt < 28) return;
        }
        lastCuePlaceRef.current = { x, y, t: now };
        socketRef.current?.emit("match:ball-in-hand", { x, y });
      },
      sendPresence: (payload: { active: boolean; angle: number; power: number }) =>
        socketRef.current?.emit("match:presence", payload),
      rematch: () => socketRef.current?.emit("match:rematch"),
      clearReplay: () => {
        setReplay(null);
        replayPayloadByIdRef.current = {};
        replayStartByIdRef.current = {};
      },
      clearShotError: () => setShotError(null)
    }),
    [
      queue,
      state,
      matchFound,
      result,
      replay,
      shotError,
      isShotPending,
      serverOffsetMs,
      selfUserId,
      presenceByUser
    ]
  );

  return api;
}
