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
  const STAKE_OPTIONS = [1, 2, 3, 5, 10, 25, 50, 100] as const;
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
  const [selectedStake, setSelectedStake] = useState<number>(10);
  const [nowMs, setNowMs] = useState(() => Date.now());
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
      {
        userId: me.id,
        username: me.username,
        group: null,
        wins: 0,
        profile: {
          wins: me.stats?.wins ?? 0,
          losses: me.stats?.losses ?? 0,
          matchesPlayed: me.stats?.matchesPlayed ?? 0,
          level: me.stats?.level ?? Math.max(1, Math.floor((me.stats?.xp ?? 0) / 1000) + 1),
          region: "Global"
        }
      },
      {
        userId: "local_opponent",
        username: "Practice Ghost",
        group: null,
        wins: 0,
        profile: {
          wins: 0,
          losses: 0,
          matchesPlayed: 0,
          level: 1,
          region: "Global"
        }
      }
    ];
    setLocalState(createMatchState("sandbox", players));
  }, [mode, me]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 100);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (mode !== "sandbox" || !localState || localReplay) return;
    if (localState.phase === "round_end" || localState.shotInProgress) return;
    const botTurn = localState.players[localState.currentTurn]?.userId === "local_opponent";
    if (!botTurn) return;

    const timeoutId = window.setTimeout(() => {
      const liveState = localState;
      if (liveState.ballInHand) {
        const cue = liveState.balls.find((b) => b.kind === "cue");
        if (cue) {
          const baseX = liveState.table.width * 0.25;
          for (let i = 0; i < 12; i += 1) {
            const y = liveState.table.height * (0.2 + Math.random() * 0.6);
            const left = liveState.table.rail + cue.radius;
            const right = liveState.table.width - liveState.table.rail - cue.radius;
            const top = liveState.table.rail + cue.radius;
            const bottom = liveState.table.height - liveState.table.rail - cue.radius;
            const pos = { x: Math.max(left, Math.min(right, baseX)), y: Math.max(top, Math.min(bottom, y)) };
            const overlaps = liveState.balls.some((b) => {
              if (b.kind === "cue" || b.pocketed) return false;
              return Math.hypot(b.pos.x - pos.x, b.pos.y - pos.y) < cue.radius + b.radius + 0.5;
            });
            if (!overlaps) {
              onPlaceCue(pos.x, pos.y);
              break;
            }
          }
        }
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
    if (currentState.ballInHand) return;

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
    const left = localState.table.rail + cue.radius;
    const right = localState.table.width - localState.table.rail - cue.radius;
    const top = localState.table.rail + cue.radius;
    const bottom = localState.table.height - localState.table.rail - cue.radius;
    const nextPos = {
      x: Math.max(left, Math.min(right, x)),
      y: Math.max(top, Math.min(bottom, y))
    };
    const overlaps = localState.balls.some((b) => {
      if (b.kind === "cue" || b.pocketed) return false;
      const minDist = cue.radius + b.radius + 0.5;
      return Math.hypot(b.pos.x - nextPos.x, b.pos.y - nextPos.y) < minDist;
    });
    if (overlaps) return;
    cue.pocketed = false;
    cue.vel = { x: 0, y: 0 };
    cue.pos = nextPos;
    setLocalState({
      ...localState,
      ballInHand: false,
      turnDeadlineMs: Date.now() + 30000,
      balls: [...localState.balls]
    });
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
  const shotClockMs = 30000;
  const syncedNowMs = mode === "online" ? nowMs + (socket.serverOffsetMs ?? 0) : nowMs;
  const activeDeadline = currentState?.turnDeadlineMs ?? null;
  const activeRemainingMs = activeDeadline ? Math.max(0, activeDeadline - syncedNowMs) : 0;
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
    <main className="mx-auto min-h-screen w-full max-w-[1600px] px-2 pb-6 pt-2 md:px-4">
      <header className="sticky top-2 z-30 rounded-xl border border-white/10 bg-[#071622]/90 px-3 py-2 shadow-glow backdrop-blur md:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold text-white md:text-lg">Eightball Arena</h1>
            <p className="text-xs text-white/65">Welcome back, {me.username}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => { setMode("online"); arenaAudio.uiTap(); }} className={`rounded-md px-2.5 py-1.5 text-xs md:text-sm ${mode === "online" ? "bg-brass text-slate" : "bg-white/10 text-white"}`}>
              Online 1v1
            </button>
            <button onClick={() => { setMode("sandbox"); arenaAudio.uiTap(); }} className={`rounded-md px-2.5 py-1.5 text-xs md:text-sm ${mode === "sandbox" ? "bg-brass text-slate" : "bg-white/10 text-white"}`}>
              Sandbox
            </button>
            <button
              onClick={async () => {
                await api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
                window.localStorage.removeItem(SESSION_CACHE_KEY);
                setMe(null);
              }}
              className="rounded-md bg-white/10 px-2.5 py-1.5 text-xs text-white md:text-sm"
            >
              Logout
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/85 md:text-xs">
          <span className="rounded bg-amber-400/20 px-2 py-1 text-amber-200">Coins: {(me.stats?.coins ?? 0).toLocaleString()}</span>
          <span className="rounded bg-emerald-400/20 px-2 py-1 text-emerald-200">Cash: {(me.stats?.cash ?? 0).toLocaleString()}</span>
          <span className="rounded bg-cyan-400/20 px-2 py-1 text-cyan-200">XP: {xp.toLocaleString()}</span>
          <span className="rounded bg-indigo-400/20 px-2 py-1 text-indigo-200">Level {level}</span>
          <div className="h-2 min-w-[150px] flex-1 overflow-hidden rounded-full bg-white/10 md:min-w-[220px]">
            <div className="h-full bg-gradient-to-r from-cyan-400 to-indigo-500" style={{ width: `${Math.round(xpProgress * 100)}%` }} />
          </div>
        </div>
        {sessionWarning && <div className="mt-2 rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{sessionWarning}</div>}
      </header>

      <div className="mt-3 grid items-start gap-3 xl:grid-cols-[minmax(230px,1fr)_minmax(760px,1080px)_minmax(230px,1fr)]">
        <aside className="hidden xl:sticky xl:top-24 xl:block">
          {currentState && (
            <PlayerProfileCard
              player={currentState.players[0]}
              group={groupLabel(currentState.players[0].group)}
              canShoot8={canShootEight(currentState, 0)}
              timeouts={currentState.timeoutStrikes[0]}
              isActive={0 === currentState.currentTurn && !currentState.shotInProgress && currentState.phase !== "round_end"}
              arcDeg={Math.max(0, Math.min(360, (activeRemainingMs / shotClockMs) * 360))}
              remainingSec={Math.min(30, Math.max(0, Math.ceil(activeRemainingMs / 1000)))}
              assignedLabel={currentState.players[0].group ? `${groupLabel(currentState.players[0].group)} Left` : "Open Table"}
              assignedNumbers={assignedGroupNumbers(currentState, 0)}
            />
          )}
        </aside>

        <section className="rounded-2xl border border-white/10 bg-black/20 p-3 md:p-4">
          {currentState && (
            <div className="mb-3 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                <Stat label="Turn" value={currentState.players[currentState.currentTurn]?.username ?? "-"} />
                <Stat
                  label="Group"
                  value={`P1: ${groupLabel(currentState.players[0].group)} | P2: ${groupLabel(currentState.players[1].group)}`}
                />
                <Stat label="Shots" value={`${currentState.shotCount}`} />
                <Stat label="Balls Left" value={`${ballsLeft}`} />
              </div>

              <div className="grid gap-2 xl:hidden md:grid-cols-2">
                <PlayerProfileCard
                  player={currentState.players[0]}
                  group={groupLabel(currentState.players[0].group)}
                  canShoot8={canShootEight(currentState, 0)}
                  timeouts={currentState.timeoutStrikes[0]}
                  isActive={0 === currentState.currentTurn && !currentState.shotInProgress && currentState.phase !== "round_end"}
                  arcDeg={Math.max(0, Math.min(360, (activeRemainingMs / shotClockMs) * 360))}
                  remainingSec={Math.min(30, Math.max(0, Math.ceil(activeRemainingMs / 1000)))}
                  assignedLabel={currentState.players[0].group ? `${groupLabel(currentState.players[0].group)} Left` : "Open Table"}
                  assignedNumbers={assignedGroupNumbers(currentState, 0)}
                />
                <PlayerProfileCard
                  player={currentState.players[1]}
                  group={groupLabel(currentState.players[1].group)}
                  canShoot8={canShootEight(currentState, 1)}
                  timeouts={currentState.timeoutStrikes[1]}
                  isActive={1 === currentState.currentTurn && !currentState.shotInProgress && currentState.phase !== "round_end"}
                  arcDeg={Math.max(0, Math.min(360, (activeRemainingMs / shotClockMs) * 360))}
                  remainingSec={Math.min(30, Math.max(0, Math.ceil(activeRemainingMs / 1000)))}
                  assignedLabel={currentState.players[1].group ? `${groupLabel(currentState.players[1].group)} Left` : "Open Table"}
                  assignedNumbers={assignedGroupNumbers(currentState, 1)}
                />
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
            <label className="text-xs uppercase tracking-wide text-white/60">Power</label>
            <input
              type="range"
              min={0.08}
              max={1}
              step={0.01}
              value={shotPower}
              onChange={(e) => setShotPower(Number(e.target.value))}
              className="w-24 md:w-28"
            />
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
            <label className="text-xs uppercase tracking-wide text-white/60">Stake</label>
            <select
              value={selectedStake}
              onChange={(e) => setSelectedStake(Number(e.target.value))}
              className="rounded-lg border border-white/20 bg-black/35 px-2 py-1 text-sm text-white"
            >
              {STAKE_OPTIONS.map((stake) => (
                <option key={stake} value={stake}>
                  {stake} coins
                </option>
              ))}
            </select>
            {!socket.queue.inQueue ? (
              <button onClick={() => socket.joinQueue(selectedStake)} className="rounded-xl bg-brass px-4 py-2 font-medium text-slate">
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

        <aside className="hidden xl:sticky xl:top-24 xl:block">
          {currentState && (
            <PlayerProfileCard
              player={currentState.players[1]}
              group={groupLabel(currentState.players[1].group)}
              canShoot8={canShootEight(currentState, 1)}
              timeouts={currentState.timeoutStrikes[1]}
              isActive={1 === currentState.currentTurn && !currentState.shotInProgress && currentState.phase !== "round_end"}
              arcDeg={Math.max(0, Math.min(360, (activeRemainingMs / shotClockMs) * 360))}
              remainingSec={Math.min(30, Math.max(0, Math.ceil(activeRemainingMs / 1000)))}
              assignedLabel={currentState.players[1].group ? `${groupLabel(currentState.players[1].group)} Left` : "Open Table"}
              assignedNumbers={assignedGroupNumbers(currentState, 1)}
            />
          )}
        </aside>
      </div>

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

function PlayerProfileCard({
  player,
  group,
  canShoot8,
  timeouts,
  isActive,
  arcDeg,
  remainingSec,
  assignedLabel,
  assignedNumbers
}: {
  player: PlayerState;
  group: string;
  canShoot8: boolean;
  timeouts: number;
  isActive: boolean;
  arcDeg: number;
  remainingSec: number;
  assignedLabel: string;
  assignedNumbers: number[];
}) {
  return (
    <div
      className="rounded-xl p-[2px]"
      style={
        isActive
          ? {
              background: `conic-gradient(from -90deg, rgba(34,211,238,0.9) 0deg ${arcDeg}deg, rgba(34,211,238,0.16) ${arcDeg}deg 360deg)`,
              boxShadow: "0 0 16px rgba(34,211,238,0.32)"
            }
          : undefined
      }
    >
      <div className={`rounded-lg border px-3 py-2 text-sm ${isActive ? "border-cyan-300/50 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-white/5 text-white/85"}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">
            {player.username} ({group})
          </div>
          <div className="text-[11px] text-white/75">Clock: {isActive ? `${remainingSec}s` : "30s"}</div>
        </div>
        <div className="text-xs">Can shoot 8: {canShoot8 ? "Yes" : "No"}</div>
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-white/80">
          <span>W/L: {player.profile?.wins ?? 0}/{player.profile?.losses ?? 0}</span>
          <span>Ratio: {ratioText(player.profile?.wins ?? 0, player.profile?.losses ?? 0)}</span>
          <span>Level: {player.profile?.level ?? 1}</span>
          <span>Games: {player.profile?.matchesPlayed ?? 0}</span>
          <span>Region: {player.profile?.region ?? "Global"}</span>
          <span>Timeouts: {timeouts}/3</span>
        </div>
        <div className="mt-2 rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
          <div className="mb-1 text-[11px] text-white/70">{assignedLabel}</div>
          {assignedNumbers.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {assignedNumbers.map((n) => (
                <BallPip key={`profile-${player.userId}-${n}`} number={n} />
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-white/45">No assigned group yet</div>
          )}
        </div>
      </div>
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

function ratioText(wins: number, losses: number): string {
  const denom = Math.max(1, losses);
  return (wins / denom).toFixed(2);
}

function assignedGroupNumbers(state: MatchState, playerIndex: number): number[] {
  const group = state.players[playerIndex]?.group;
  if (!group) return [];
  const range = group === "solids" ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
  return range.filter((n) => state.balls.some((b) => b.number === n && !b.pocketed));
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
