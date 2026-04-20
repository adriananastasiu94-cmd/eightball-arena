"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthPanel } from "@/components/AuthPanel";
import { GameCanvas } from "@/components/GameCanvas";
import { CustomizationMenu } from "@/components/CustomizationMenu";
import { useArenaSocket } from "@/hooks/useArenaSocket";
import { api } from "@/lib/api";
import { arenaAudio } from "@/game/audio/audio";
import { MatchState, PlayerState, ShotInput } from "@/game/types";
import { createMatchState } from "@/game/state";
import { applyCueImpulse, simulateShot } from "@/game/physics/engine";
import { adjudicateShot, applyOutcomeToTurn } from "@/game/rules/eightBallRules";
import { CUE_STYLES, TABLE_SKINS } from "@/game/rendering/customization";

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
    xp: number;
    coins: number;
    cash: number;
    ownedCueIds: string[];
    equippedCueId: string;
  } | null;
};

export default function HomePage() {
  const SESSION_CACHE_KEY = "arena_cached_user_v1";
  const [me, setMe] = useState<Me | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionWarning, setSessionWarning] = useState<string | null>(null);
  const [assistStrength, setAssistStrength] = useState(0.65);
  const [shotPower, setShotPower] = useState(0.42);
  const [cueIndex, setCueIndex] = useState(0);
  const [tableIndex, setTableIndex] = useState(0);
  const [lockerOpen, setLockerOpen] = useState(false);
  const [busyCueId, setBusyCueId] = useState<string | null>(null);
  const [mode, setMode] = useState<"online" | "sandbox">("online");
  const [localState, setLocalState] = useState<MatchState | null>(null);
  const [localReplay, setLocalReplay] = useState<{ id: string; frames: MatchState["balls"][]; fps: number } | null>(null);
  const socket = useArenaSocket(Boolean(me) && mode === "online");

  useEffect(() => {
    const cached = window.localStorage.getItem(SESSION_CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as Me;
        setMe(parsed);
      } catch {
        window.localStorage.removeItem(SESSION_CACHE_KEY);
      }
    }

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const hydrateProfile = async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const res = await api<{ user: Me }>("/api/profile");
          const incoming = res.user;
          const equippedId = incoming.stats?.equippedCueId ?? "cue_beginner";
          const idx = CUE_STYLES.findIndex((c) => c.id === equippedId);
          if (idx >= 0) setCueIndex(idx);
          setMe(incoming);
          window.localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(incoming));
          setSessionWarning(null);
          setAuthLoading(false);
          return;
        } catch {
          if (attempt < 2) await sleep((attempt + 1) * 450);
        }
      }

      setAuthLoading(false);
      if (cached) {
        setSessionWarning("Using cached session data. Reconnect to sync latest profile.");
      } else {
        setMe(null);
      }
    };

    hydrateProfile();
  }, []);

  useEffect(() => {
    if (!me) return;
    window.localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(me));
  }, [me]);

  useEffect(() => {
    if (mode !== "sandbox" || !me) return;
    const players: [PlayerState, PlayerState] = [
      { userId: me.id, username: me.username, group: null, wins: 0 },
      { userId: "local_opponent", username: "Practice Ghost", group: null, wins: 0 }
    ];
    setLocalState(createMatchState("sandbox", players));
  }, [mode, me]);

  useEffect(() => {
    if (mode !== "sandbox" || !localState || localReplay) return;
    if (localState.phase === "round_end" || localState.shotInProgress) return;
    const botTurn = localState.players[localState.currentTurn]?.userId === "local_opponent";
    if (!botTurn) return;

    const timeoutId = window.setTimeout(() => {
      const liveState = localState;
      if (liveState.ballInHand) {
        const y = liveState.table.height * (0.3 + Math.random() * 0.4);
        onPlaceCue(liveState.table.width * 0.24, y);
      }

      const cue = liveState.balls.find((b) => b.kind === "cue" && !b.pocketed);
      const targets = liveState.balls.filter((b) => !b.pocketed && b.kind !== "cue");
      if (!cue || targets.length === 0) return;

      const target = targets.reduce((best, candidate) => {
        const dBest = Math.hypot(best.pos.x - cue.pos.x, best.pos.y - cue.pos.y);
        const dCand = Math.hypot(candidate.pos.x - cue.pos.x, candidate.pos.y - cue.pos.y);
        return dCand < dBest ? candidate : best;
      }, targets[0]);

      const baseAngle = Math.atan2(target.pos.y - cue.pos.y, target.pos.x - cue.pos.x);
      const jitter = (Math.random() - 0.5) * 0.18;
      const power = Math.min(0.85, Math.max(0.35, Math.hypot(target.pos.x - cue.pos.x, target.pos.y - cue.pos.y) / 420));
      onShoot({ angle: baseAngle + jitter, power, spin: { x: 0, y: 0 } });
    }, 650);

    return () => window.clearTimeout(timeoutId);
  }, [mode, localState, localReplay]);

  const currentState = mode === "online" ? socket.state : localState;

  const onShoot = (shot: ShotInput) => {
    if (!currentState || !me) return;

    if (mode === "online" && socket.shotLocked) return;
    if (mode === "sandbox" && localReplay) return;
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
      scratched,
      cushionHits: sim.events.filter((e) => e.type === "cushion").length,
      isBreakShot: !next.breakDone
    });
    applyOutcomeToTurn(next, outcome);
    const fps = 30;
    const sampleStep = 4;
    const frames = sim.frames
      .filter((_, idx) => idx % sampleStep === 0 || idx === sim.frames.length - 1)
      .map((frame) => frame.map((b) => ({ ...b, pos: { ...b.pos }, vel: { ...b.vel } })));
    setLocalReplay({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, frames, fps });
    window.setTimeout(() => setLocalState(next), Math.max(120, Math.round((frames.length / fps) * 1000)));

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
  const pocketedBalls = useMemo(
    () =>
      currentState?.balls
        .filter((b) => b.pocketed && b.number >= 1 && b.number <= 15)
        .map((b) => b.number)
        .sort((a, b) => a - b) ?? [],
    [currentState]
  );
  const ballsLeft = useMemo(
    () => currentState?.balls.filter((b) => !b.pocketed && b.kind !== "cue").length ?? 15,
    [currentState]
  );
  const xp = me?.stats?.xp ?? 0;
  const level = Math.max(1, me?.stats?.level ?? Math.floor(xp / 1000) + 1);
  const currentLevelStart = (level - 1) * 1000;
  const currentLevelEnd = level * 1000;
  const xpProgress = Math.max(0, Math.min(1, (xp - currentLevelStart) / Math.max(1, currentLevelEnd - currentLevelStart)));

  const onEquipCue = async (index: number) => {
    if (!me?.stats) return;
    const cue = CUE_STYLES[index];
    if (!cue) return;
    if (!me.stats.ownedCueIds.includes(cue.id)) return;
    setBusyCueId(cue.id);
    try {
      await api("/api/shop/cues", {
        method: "POST",
        body: JSON.stringify({ action: "equip", cueId: cue.id })
      });
      setCueIndex(index);
      setMe((prev) =>
        prev
          ? {
              ...prev,
              stats: prev.stats
                ? {
                    ...prev.stats,
                    equippedCueId: cue.id
                  }
                : prev.stats
            }
          : prev
      );
    } finally {
      setBusyCueId(null);
    }
  };

  const onBuyCue = async (index: number) => {
    if (!me?.stats) return;
    const cue = CUE_STYLES[index];
    if (!cue) return;
    setBusyCueId(cue.id);
    try {
      const res = await api<{
        wallet: { coins: number; cash: number; xp: number; level: number };
        inventory: { ownedCueIds: string[]; equippedCueId: string };
      }>("/api/shop/cues", {
        method: "POST",
        body: JSON.stringify({ action: "buy", cueId: cue.id })
      });

      setMe((prev) =>
        prev
          ? {
              ...prev,
              stats: prev.stats
                ? {
                    ...prev.stats,
                    coins: res.wallet.coins,
                    cash: res.wallet.cash,
                    xp: res.wallet.xp,
                    level: res.wallet.level,
                    ownedCueIds: res.inventory.ownedCueIds,
                    equippedCueId: res.inventory.equippedCueId
                  }
                : prev.stats
            }
          : prev
      );
      const equippedIdx = CUE_STYLES.findIndex((c) => c.id === res.inventory.equippedCueId);
      if (equippedIdx >= 0) setCueIndex(equippedIdx);
    } catch (err) {
      console.error(err);
    } finally {
      setBusyCueId(null);
    }
  };

  if (authLoading && !me) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 text-white/80">
        Restoring session...
      </main>
    );
  }

  if (!me) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <AuthPanel onAuthed={(u) => setMe({ ...u })} />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 p-3 md:p-6">
      <div className="rounded-2xl border border-white/10 bg-black/30 p-3 shadow-glow">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-white">Freemium Progress</div>
          <div className="flex items-center gap-3 text-xs text-white/85">
            <span className="rounded bg-amber-400/20 px-2 py-1 text-amber-200">Coins: {(me.stats?.coins ?? 0).toLocaleString()}</span>
            <span className="rounded bg-emerald-400/20 px-2 py-1 text-emerald-200">Cash: {(me.stats?.cash ?? 0).toLocaleString()}</span>
            <span className="rounded bg-cyan-400/20 px-2 py-1 text-cyan-200">XP: {xp.toLocaleString()}</span>
            <span className="rounded bg-indigo-400/20 px-2 py-1 text-indigo-200">Level {level}</span>
          </div>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-gradient-to-r from-cyan-400 to-indigo-500" style={{ width: `${Math.round(xpProgress * 100)}%` }} />
        </div>
      </div>

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
                window.localStorage.removeItem(SESSION_CACHE_KEY);
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
        {sessionWarning && <div className="mt-3 rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{sessionWarning}</div>}
      </header>

      <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
        {currentState && (
          <div className="mb-3 rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              <Stat label="Turn" value={currentState.players[currentState.currentTurn]?.username ?? "-"} />
              <Stat
                label="Group"
                value={`P1: ${groupLabel(currentState.players[0].group)} | P2: ${groupLabel(currentState.players[1].group)}`}
              />
              <Stat label="Shots" value={`${currentState.shotCount}`} />
              <Stat label="Balls Left" value={`${ballsLeft}`} />
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              {currentState.players.map((p, idx) => (
                <div
                  key={p.userId}
                  className={`rounded-lg border px-3 py-2 text-sm ${idx === currentState.currentTurn ? "border-cyan-300/50 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-white/5 text-white/85"}`}
                >
                  <div className="font-semibold">
                    {p.username} ({groupLabel(p.group)})
                  </div>
                  <div className="text-xs">Can shoot 8: {canShootEight(currentState, idx) ? "Yes" : "No"}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-white/80">
          <div>
            {currentState
              ? currentState.shotInProgress
                ? `Turn: ${currentState.players[currentState.currentTurn]?.username} | shot resolving`
                : `Turn: ${currentState.players[currentState.currentTurn]?.username}`
              : mode === "online"
                ? "Join queue to start a match"
                : "Sandbox ready"}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs uppercase tracking-wide text-white/60">Aim Assist</label>
            <input
              type="range"
              min={0.15}
              max={1}
              step={0.05}
              value={assistStrength}
              onChange={(e) => setAssistStrength(Number(e.target.value))}
            />
            <button onClick={() => setLockerOpen(true)} className="ml-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white">
              Locker
            </button>
            <span className="text-xs text-white/60">
              {CUE_STYLES[cueIndex]?.name} | {TABLE_SKINS[tableIndex]?.name}
            </span>
          </div>
        </div>

        <GameCanvas
          state={currentState}
          myUserId={me.id}
          onShoot={onShoot}
          onPlaceCue={onPlaceCue}
          assistStrength={assistStrength}
          shotPower={shotPower}
          onShotPowerChange={setShotPower}
          cueStyle={CUE_STYLES[cueIndex]}
          tableSkin={TABLE_SKINS[tableIndex]}
          replay={mode === "online" ? socket.replay : localReplay}
          inputLocked={mode === "online" ? socket.shotLocked : Boolean(localReplay)}
          lockLabel={mode === "online" ? "Waiting for shot result..." : "Playing shot..."}
          onReplayDone={() => {
            if (mode === "online") socket.clearReplay();
            else setLocalReplay(null);
          }}
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
                  ? socket.shotLocked
                    ? "Shot resolving..."
                    : "Match found"
                  : "Ready"}
            </span>
            {socket.result && (
              <button onClick={socket.rematch} className="rounded-xl bg-emerald-500/80 px-4 py-2 text-sm font-medium text-white">
                Rematch
              </button>
            )}
          </div>
        )}

        {mode === "online" && socket.shotError && (
          <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            Shot rejected: {socket.shotError}
          </div>
        )}

        {currentState?.lastOutcome && (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/85">
            {currentState.lastOutcome.foul
              ? `Foul: ${currentState.lastOutcome.reason || "Rule violation"}`
              : currentState.lastOutcome.turnContinues
                ? "Great shot. Turn continues."
                : "Turn passed to opponent."}
          </div>
        )}

        {socket.result && (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-white">
            <div className="font-semibold">{socket.result.winnerUserId === me.id ? "Victory" : "Defeat"}</div>
            <div className="text-sm text-white/70">Reason: {socket.result.reason}</div>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="mb-2 text-sm font-semibold text-white">Pocketed Balls</div>
          <div className="flex min-h-10 flex-wrap gap-2">
            {pocketedBalls.length === 0 ? (
              <span className="text-xs text-white/55">None yet</span>
            ) : (
              pocketedBalls.map((n) => <BallPip key={`pocketed-${n}`} number={n} />)
            )}
          </div>
        </div>
      </section>

      <CustomizationMenu
        open={lockerOpen}
        selectedCueIndex={cueIndex}
        selectedTableIndex={tableIndex}
        cues={CUE_STYLES}
        tables={TABLE_SKINS}
        ownedCueIds={me.stats?.ownedCueIds ?? ["cue_beginner"]}
        coins={me.stats?.coins ?? 0}
        cash={me.stats?.cash ?? 0}
        busyCueId={busyCueId}
        onSelectCue={onEquipCue}
        onBuyCue={onBuyCue}
        onSelectTable={setTableIndex}
        onClose={() => setLockerOpen(false)}
      />
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

function groupLabel(group: "solids" | "stripes" | null): string {
  if (!group) return "Open";
  return group === "solids" ? "Solids" : "Stripes";
}

function canShootEight(state: MatchState, playerIndex: number): boolean {
  const p = state.players[playerIndex];
  if (!p.group) return false;
  return state.balls.filter((b) => !b.pocketed && (p.group === "solids" ? b.number >= 1 && b.number <= 7 : b.number >= 9 && b.number <= 15)).length === 0;
}

function BallPip({ number }: { number: number }) {
  const color = colorForBall(number);
  const stripe = number >= 9;
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-white/35 bg-white text-[10px] font-bold text-black">
      <span
        className="flex h-full w-full items-center justify-center"
        style={{
          background: stripe ? `linear-gradient(180deg,#ffffff 0 24%,${color} 24% 76%,#ffffff 76% 100%)` : color
        }}
      >
        <span className="rounded-full bg-white/95 px-0.5 leading-none">{number}</span>
      </span>
    </span>
  );
}

function colorForBall(number: number): string {
  const n = number >= 9 ? number - 8 : number;
  switch (n) {
    case 1:
      return "#f8cf3d";
    case 2:
      return "#2f74df";
    case 3:
      return "#d4453e";
    case 4:
      return "#7b43c4";
    case 5:
      return "#ef8732";
    case 6:
      return "#2a8a4e";
    case 7:
      return "#7a1e1e";
    default:
      return "#10161f";
  }
}
