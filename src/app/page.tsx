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
  const [me, setMe] = useState<Me | null>(null);
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
    api<{ user: Me }>("/api/profile")
      .then((res) => {
        const incoming = res.user;
        const equippedId = incoming.stats?.equippedCueId ?? "cue_beginner";
        const idx = CUE_STYLES.findIndex((c) => c.id === equippedId);
        if (idx >= 0) setCueIndex(idx);
        setMe(incoming);
      })
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
