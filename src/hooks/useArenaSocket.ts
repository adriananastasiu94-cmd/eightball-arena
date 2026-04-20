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
  const socketRef = useRef<Socket | null>(null);

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
    });
    socket.on("match:state", ({ state: nextState }) => setState(nextState));
    socket.on("match:replay", (payload) => {
      setReplay({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        frames: payload.frames,
        fps: payload.fps
      });
    });
    socket.on("match:ended", (payload) => setResult(payload));

    socketRef.current = socket;

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [enabled]);

  const api = useMemo(
    () => ({
      queue,
      state,
      matchFound,
      result,
      replay,
      joinQueue: () => socketRef.current?.emit("queue:join"),
      leaveQueue: () => socketRef.current?.emit("queue:leave"),
      shoot: (shot: ShotInput) => socketRef.current?.emit("match:shot", shot),
      placeCue: (x: number, y: number) => socketRef.current?.emit("match:ball-in-hand", { x, y }),
      rematch: () => socketRef.current?.emit("match:rematch"),
      clearReplay: () => setReplay(null)
    }),
    [queue, state, matchFound, result, replay]
  );

  return api;
}
