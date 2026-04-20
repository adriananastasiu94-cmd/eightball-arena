"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { BallState, MatchState, ShotInput } from "@/game/types";

type QueueStatus = { inQueue: boolean; eta: number | null };

export function useArenaSocket(enabled: boolean) {
  const [queue, setQueue] = useState<QueueStatus>({ inQueue: false, eta: null });
  const [state, setState] = useState<MatchState | null>(null);
  const [matchFound, setMatchFound] = useState(false);
  const [result, setResult] = useState<{ winnerUserId: string | null; reason: string } | null>(null);
  const [replay, setReplay] = useState<{ id: string; frames: BallState[][]; fps: number } | null>(null);
  const [isShotPending, setIsShotPending] = useState(false);
  const [shotError, setShotError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const lockTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const socket = io({
      path: process.env.NEXT_PUBLIC_SOCKET_PATH || "/socket.io",
      withCredentials: true
    });

    socket.on("queue:status", setQueue);
    socket.on("match:found", () => {
      setMatchFound(true);
      setResult(null);
      setShotError(null);
    });
    socket.on("match:state", ({ state: nextState }) => {
      setState(nextState);
      if (!nextState.shotInProgress) setIsShotPending(false);
    });
    socket.on("match:replay", (payload) => {
      const durationMs =
        typeof payload.durationMs === "number"
          ? payload.durationMs
          : Math.max(300, Math.round((payload.frames.length / Math.max(1, payload.fps)) * 1000));

      setReplay({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        frames: payload.frames,
        fps: payload.fps
      });
      setIsShotPending(true);
      if (lockTimerRef.current !== null) window.clearTimeout(lockTimerRef.current);
      lockTimerRef.current = window.setTimeout(() => setIsShotPending(false), durationMs + 80);
    });
    socket.on("match:ended", (payload) => setResult(payload));
    socket.on("match:shot-rejected", (payload) => {
      setShotError(payload.reason);
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
      state,
      matchFound,
      result,
      replay,
      shotError,
      shotLocked: isShotPending || Boolean(state?.shotInProgress),
      joinQueue: () => socketRef.current?.emit("queue:join"),
      leaveQueue: () => socketRef.current?.emit("queue:leave"),
      shoot: (shot: ShotInput) => {
        if (isShotPending || state?.shotInProgress) return;
        setShotError(null);
        setIsShotPending(true);
        socketRef.current?.emit("match:shot", shot);
      },
      placeCue: (x: number, y: number) => socketRef.current?.emit("match:ball-in-hand", { x, y }),
      rematch: () => socketRef.current?.emit("match:rematch"),
      clearReplay: () => setReplay(null),
      clearShotError: () => setShotError(null)
    }),
    [queue, state, matchFound, result, replay, shotError, isShotPending]
  );

  return api;
}
