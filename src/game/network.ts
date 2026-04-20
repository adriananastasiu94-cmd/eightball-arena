import { MatchState, ShotInput } from "./types";

export type ClientToServerEvents = {
  "queue:join": () => void;
  "queue:leave": () => void;
  "match:shot": (payload: ShotInput) => void;
  "match:ball-in-hand": (payload: { x: number; y: number }) => void;
  "match:rematch": () => void;
};

export type ServerToClientEvents = {
  "queue:status": (payload: { inQueue: boolean; eta: number | null }) => void;
  "match:found": (payload: { matchId: string; opponent: { username: string; avatarUrl: string | null } }) => void;
  "match:state": (payload: { state: MatchState; serverTime: number }) => void;
  "match:replay": (payload: { frames: MatchState["balls"][]; fps: number; durationMs?: number }) => void;
  "match:shot-rejected": (payload: { reason: string }) => void;
  "match:ended": (payload: { winnerUserId: string | null; reason: string }) => void;
  "session:error": (payload: { code: string; message: string }) => void;
};
