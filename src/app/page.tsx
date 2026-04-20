"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthPanel } from "@/components/AuthPanel";
import { GameCanvas } from "@/components/GameCanvas";
import { useArenaSocket } from "@/hooks/useArenaSocket";
import { api } from "@/lib/api";
import { arenaAudio } from "@/game/audio/audio";
import { MatchState, PlayerState, ShotInput } from "@/game/types";
import { createMatchState } from "@/game/state";
import { applyCueImpulse, simulateShot } from "@/game/physics/engine";
import { adjudicateShot, applyOutcomeToTurn } from "@/game/rules/eightBallRules";

type Me = {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string | null;
  stats?: {
    wins: number;
    losses: number;
    matchesPlayed: number;
    rating: number;
    level: number;
  } | null;
};

export default function HomePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [assistStrength, setAssistStrength] = useState(0.65);
  const [mode, setMode] = useState<"online" | "sandbox">("online");
  const [localState, setLocalState] = useState<MatchState | null>(null);
  const socket = useArenaSocket(Boolean(me) && mode === "online");

  useEffect(() => {
    api<{ user: Me }>("/api/profile")
      .then((res) => setMe(res.user))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (mode !== "sandbox" || !me) return;
    const players: [PlayerState, PlayerState] = [
      { userId: me.id, username: me.username, group: null, wins: 0 },
      { userId: "local_opponent", username: "Practice Ghost", group: null, wins: 0 }
    ];
    setLocalState(createMatchState("sandbox", players));
  }, [mode, me]);

  const currentState = mode === "online" ? socket.state : localState;

  const onShoot = (shot: ShotInput) => {
    if (!currentState || !me) return;
    arenaAudio.cueHit();

    if (mode === "online") {
      socket.shoot(shot);
      return;
    }

    const ballsAfterImpulse = applyCueImpulse(currentState.balls, shot.angle, shot.power, shot.spin);
    const sim = simulateShot(currentState.table, ballsAfterImpulse);
    const pocketed = sim.events.filter((e) => e.type === "pocket").map((e) => e.ballId);
    const firstContact = sim.events.find((e) => e.type === "first_contact");
    const scratched = sim.finalBalls.find((b) => b.kind === "cue")?.pocketed ?? false;

    const next: MatchState = {
      ...currentState,
      balls: sim.finalBalls.map((b) => ({ ...b, pos: { ...b.pos }, vel: { ...b.vel } }))
    };

    const outcome = adjudicateShot(next, {
      pocketed,
      firstContact: firstContact && "targetBallId" in firstContact ? firstContact.targetBallId : null,
      scratched
    });
    applyOutcomeToTurn(next, outcome);
    setLocalState(next);

    if (pocketed.length) arenaAudio.pocket();
  };

  const onPlaceCue = (x: number, y: number) => {
    if (mode === "online") {
      socket.placeCue(x, y);
      return;
    }
    if (!localState) return;
    const cue = localState.balls.find((b) => b.kind === "cue");
    if (!cue) return;
    cue.pocketed = false;
    cue.vel = { x: 0, y: 0 };
    cue.pos = { x, y };
    setLocalState({ ...localState, balls: [...localState.balls] });
  };

  const solidsRemaining = useMemo(() => currentState?.balls.filter((b) => !b.pocketed && b.number >= 1 && b.number <= 7).length ?? 7, [currentState]);
  const stripesRemaining = useMemo(() => currentState?.balls.filter((b) => !b.pocketed && b.number >= 9 && b.number <= 15).length ?? 7, [currentState]);

  if (!me) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <AuthPanel onAuthed={(u) => setMe({ ...u })} />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 p-3 md:p-6">
      <header className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-glow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white">Eightball Arena</h1>
            <p className="text-sm text-white/70">Welcome back, {me.username}.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setMode("online"); arenaAudio.uiTap(); }} className={`rounded-lg px-3 py-2 text-sm ${mode === "online" ? "bg-brass text-slate" : "bg-white/10 text-white"}`}>
              Online 1v1
            </button>
            <button onClick={() => { setMode("sandbox"); arenaAudio.uiTap(); }} className={`rounded-lg px-3 py-2 text-sm ${mode === "sandbox" ? "bg-brass text-slate" : "bg-white/10 text-white"}`}>
              Sandbox
            </button>
            <button
              onClick={async () => {
                await api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
                setMe(null);
              }}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="W/L" value={`${me.stats?.wins ?? 0}/${me.stats?.losses ?? 0}`} />
          <Stat label="Matches" value={`${me.stats?.matchesPlayed ?? 0}`} />
          <Stat label="Rating" value={`${me.stats?.rating ?? 1000}`} />
          <Stat label="Solids" value={`${solidsRemaining}`} />
          <Stat label="Stripes" value={`${stripesRemaining}`} />
        </div>
      </header>

      <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-white/80">
          <div>
            {currentState
              ? `Turn: ${currentState.players[currentState.currentTurn]?.username}`
              : mode === "online"
                ? "Join queue to start a match"
                : "Sandbox ready"}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs uppercase tracking-wide text-white/60">Aim Assist</label>
            <input
              type="range"
              min={0.15}
              max={1}
              step={0.05}
              value={assistStrength}
              onChange={(e) => setAssistStrength(Number(e.target.value))}
            />
          </div>
        </div>

        <GameCanvas
          state={currentState}
          myUserId={me.id}
          onShoot={onShoot}
          onPlaceCue={onPlaceCue}
          assistStrength={assistStrength}
        />

        {mode === "online" && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!socket.queue.inQueue ? (
              <button onClick={socket.joinQueue} className="rounded-xl bg-brass px-4 py-2 font-medium text-slate">
                Play Now
              </button>
            ) : (
              <button onClick={socket.leaveQueue} className="rounded-xl bg-white/15 px-4 py-2 font-medium text-white">
                Cancel Queue
              </button>
            )}
            <span className="text-sm text-white/70">
              {socket.queue.inQueue
                ? `Searching for opponent... ETA ${socket.queue.eta ?? "--"}s`
                : socket.matchFound
                  ? "Match found"
                  : "Ready"}
            </span>
            {socket.result && (
              <button onClick={socket.rematch} className="rounded-xl bg-emerald-500/80 px-4 py-2 text-sm font-medium text-white">
                Rematch
              </button>
            )}
          </div>
        )}

        {socket.result && (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-white">
            <div className="font-semibold">{socket.result.winnerUserId === me.id ? "Victory" : "Defeat"}</div>
            <div className="text-sm text-white/70">Reason: {socket.result.reason}</div>
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-2">
      <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
