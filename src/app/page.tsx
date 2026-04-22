"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { AuthPanel } from "@/components/AuthPanel";
import { GameCanvas } from "@/components/GameCanvas";
import { CustomizationMenu } from "@/components/CustomizationMenu";
import { useArenaSocket } from "@/hooks/useArenaSocket";
import { api } from "@/lib/api";
import { arenaAudio } from "@/game/audio/audio";
import { MatchState, PlayerState, ShotInput, TableConfig } from "@/game/types";
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
    winStreak?: number;
    rating: number;
    level: number;
    xp: number;
    coins: number;
    cash: number;
    ownedCueIds: string[];
    equippedCueId: string;
  } | null;
};

type MenuView = "main" | "oneVOne" | "tournaments" | "bots" | "game";
type BotDifficulty = "easy" | "normal" | "hard" | "pro";
type TournamentRound = 1 | 2 | 3;

type BotDifficultyConfig = {
  label: string;
  reward: number;
  xpReward: number;
  jitter: number;
  powerMin: number;
  powerMax: number;
  thinkMs: number;
  missChance: number;
};

type SandboxSession = {
  key: number;
  kind: "bots" | "tournament";
  difficulty: BotDifficulty;
  rewardCoins: number;
  rewardXp: number;
  opponentId: string;
  opponentName: string;
  roundLabel?: string;
  tournamentMatchId?: string;
  resolved: boolean;
};

type TournamentParticipant = {
  id: string;
  name: string;
  difficulty: BotDifficulty;
  isUser: boolean;
};

type TournamentMatch = {
  id: string;
  round: TournamentRound;
  leftId: string | null;
  rightId: string | null;
  leftSourceId: string | null;
  rightSourceId: string | null;
  winnerId: string | null;
  status: "pending" | "active" | "done";
};

type TournamentRun = {
  id: string;
  stake: number;
  pot: number;
  participants: TournamentParticipant[];
  matches: TournamentMatch[];
  currentMatchId: string | null;
  status: "active" | "eliminated" | "won";
};

const BOT_CONFIG: Record<BotDifficulty, BotDifficultyConfig> = {
  easy: {
    label: "Easy",
    reward: 1,
    xpReward: 1,
    jitter: 0.42,
    powerMin: 0.25,
    powerMax: 0.58,
    thinkMs: 1250,
    missChance: 0.45
  },
  normal: {
    label: "Normal",
    reward: 2,
    xpReward: 2,
    jitter: 0.24,
    powerMin: 0.32,
    powerMax: 0.72,
    thinkMs: 950,
    missChance: 0.22
  },
  hard: {
    label: "Hard",
    reward: 5,
    xpReward: 5,
    jitter: 0.14,
    powerMin: 0.36,
    powerMax: 0.84,
    thinkMs: 720,
    missChance: 0.1
  },
  pro: {
    label: "Pro",
    reward: 10,
    xpReward: 10,
    jitter: 0.08,
    powerMin: 0.42,
    powerMax: 0.95,
    thinkMs: 520,
    missChance: 0.04
  }
};

const TOURNAMENT_STAKES = [1, 5, 10, 50, 100, 1000] as const;

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
  const [mode, setMode] = useState<"online" | "sandbox">("sandbox");
  const [localState, setLocalState] = useState<MatchState | null>(null);
  const [localReplay, setLocalReplay] = useState<{
    id: string;
    frames: MatchState["balls"][];
    fps: number;
    startAtMs?: number;
  } | null>(null);
  const [selectedStake, setSelectedStake] = useState<number>(10);
  const [menuView, setMenuView] = useState<MenuView>("main");
  const [pendingQueueStake, setPendingQueueStake] = useState<number | null>(null);
  const [sandboxSession, setSandboxSession] = useState<SandboxSession | null>(null);
  const [selectedTournamentStake, setSelectedTournamentStake] = useState<number>(10);
  const [tournamentRun, setTournamentRun] = useState<TournamentRun | null>(null);
  const [menuNotice, setMenuNotice] = useState<string | null>(null);
  const [liveTableConfig, setLiveTableConfig] = useState<TableConfig | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [winnerBalancePreview, setWinnerBalancePreview] = useState<number | null>(null);
  const handledResultMatchIdRef = useRef<string | null>(null);
  const socket = useArenaSocket(Boolean(me) && mode === "online");
  const myLiveUserId = socket.selfUserId ?? me?.id ?? null;
  const opponentPresence = useMemo(() => {
    if (!myLiveUserId) return null;
    const all = Object.values(socket.presenceByUser ?? {});
    if (all.length === 0) return null;
    const latest = all
      .filter((p) => p.userId !== myLiveUserId)
      .sort((a, b) => b.t - a.t)[0];
    return latest ?? null;
  }, [socket.presenceByUser, myLiveUserId]);

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
          const equippedId = incoming.stats?.equippedCueId ?? "cue_classic";
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
    if (!me) return;
    let cancelled = false;
    api<{ config: TableConfig }>("/api/admin/table-config")
      .then((res) => {
        if (!cancelled) setLiveTableConfig(res.config);
      })
      .catch(() => {
        if (!cancelled) setLiveTableConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, [me]);

  useEffect(() => {
    if (mode !== "sandbox" || !me || !sandboxSession) return;
    const players: [PlayerState, PlayerState] = [
      {
        userId: me.id,
        username: me.username,
        avatarUrl: me.avatarUrl ?? null,
        group: null,
        wins: 0,
        profile: {
          wins: me.stats?.wins ?? 0,
          losses: me.stats?.losses ?? 0,
          matchesPlayed: me.stats?.matchesPlayed ?? 0,
          winStreak: me.stats?.winStreak ?? 0,
          level: me.stats?.level ?? Math.max(1, Math.floor((me.stats?.xp ?? 0) / 1000) + 1),
          region: "Global"
        }
      },
      {
        userId: sandboxSession.opponentId,
        username: sandboxSession.opponentName,
        avatarUrl: null,
        group: null,
        wins: 0,
        profile: {
          wins: 0,
          losses: 0,
          matchesPlayed: 0,
          winStreak: 0,
          level:
            sandboxSession.difficulty === "pro"
              ? 6
              : sandboxSession.difficulty === "hard"
                ? 4
                : sandboxSession.difficulty === "normal"
                  ? 2
                  : 1,
          region: sandboxSession.kind === "tournament" ? "Tournament" : "Bot Arena"
        }
      }
    ];
    setLocalReplay(null);
    setLocalState(createMatchState(`sandbox_${sandboxSession.key}`, players, liveTableConfig ?? undefined));
  }, [mode, me, sandboxSession, liveTableConfig]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 100);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (menuView !== "game" || mode !== "online" || pendingQueueStake === null) return;
    const id = window.setTimeout(() => {
      socket.joinQueue(pendingQueueStake);
      setPendingQueueStake(null);
    }, 220);
    return () => window.clearTimeout(id);
  }, [menuView, mode, pendingQueueStake, socket]);

  const applyProgressDelta = ({ coins = 0, xp = 0 }: { coins?: number; xp?: number }) => {
    setMe((prev) =>
      prev
        ? {
            ...prev,
            stats: prev.stats
              ? {
                  ...prev.stats,
                  coins: Math.max(0, prev.stats.coins + coins),
                  xp: Math.max(0, prev.stats.xp + xp),
                  level: Math.max(
                    1,
                    Math.floor(Math.max(0, prev.stats.xp + xp) / 1000) + 1
                  )
                }
              : prev.stats
          }
        : prev
    );
  };

  const openMainMenu = () => {
    socket.leaveQueue();
    setPendingQueueStake(null);
    setMode("sandbox");
    setMenuView("main");
    setLocalReplay(null);
    setLocalState(null);
    setSandboxSession(null);
  };

  const startOneVOneMenuFlow = () => {
    setMenuNotice(null);
    setMode("online");
    setMenuView("game");
    setPendingQueueStake(selectedStake);
  };

  const startBotsMatch = (difficulty: BotDifficulty) => {
    const cfg = BOT_CONFIG[difficulty];
    setMenuNotice(null);
    setMode("sandbox");
    setMenuView("game");
    setSandboxSession({
      key: Date.now(),
      kind: "bots",
      difficulty,
      rewardCoins: cfg.reward,
      rewardXp: cfg.xpReward,
      opponentId: `bot_${difficulty}`,
      opponentName: `${cfg.label} Bot`,
      roundLabel: `${cfg.label} Challenge`,
      resolved: false
    });
  };

  const startTournament = () => {
    if (!me) return;
    if ((me.stats?.coins ?? 0) < selectedTournamentStake) {
      setMenuNotice(`Not enough coins. You need ${selectedTournamentStake} to enter this tournament.`);
      return;
    }

    const run = createTournamentRun(me, selectedTournamentStake);
    applyProgressDelta({ coins: -selectedTournamentStake });
    const seeded = autoResolveTournamentMatches(run.matches, run.participants, me.id);
    const nextMatch = pickNextUserMatch(seeded, me.id);
    setTournamentRun({
      ...run,
      matches: seeded,
      currentMatchId: nextMatch?.id ?? null,
      status: nextMatch ? "active" : "eliminated"
    });

    if (!nextMatch) {
      setMenuNotice("Tournament could not start. Please retry.");
      return;
    }

    const nextOpponent = tournamentOpponent(run.participants, nextMatch, me.id);
    if (!nextOpponent) {
      setMenuNotice("Tournament pairing error. Please retry.");
      return;
    }

    setMenuNotice(null);
    setMode("sandbox");
    setMenuView("game");
    setSandboxSession({
      key: Date.now(),
      kind: "tournament",
      difficulty: nextOpponent.difficulty,
      rewardCoins: 0,
      rewardXp: 0,
      opponentId: nextOpponent.id,
      opponentName: nextOpponent.name,
      tournamentMatchId: nextMatch.id,
      roundLabel: tournamentRoundLabel(nextMatch.round),
      resolved: false
    });
  };

  useEffect(() => {
    if (mode !== "sandbox" || !sandboxSession || sandboxSession.resolved || !localState || !me) return;
    if (localState.phase !== "round_end") return;
    const winnerUserId = localState.lastOutcome?.winnerUserId;

    if (sandboxSession.kind === "bots") {
      if (winnerUserId === me.id) {
        applyProgressDelta({ coins: sandboxSession.rewardCoins, xp: sandboxSession.rewardXp });
        setMenuNotice(
          `Victory. ${sandboxSession.rewardCoins} coins and ${sandboxSession.rewardXp} EXP added.`
        );
      } else {
        setMenuNotice("Defeat. Try another bot difficulty.");
      }
      setSandboxSession((prev) => (prev ? { ...prev, resolved: true } : prev));
      return;
    }

    if (!tournamentRun || !sandboxSession.tournamentMatchId) {
      setSandboxSession((prev) => (prev ? { ...prev, resolved: true } : prev));
      return;
    }

    const currentMatch = tournamentRun.matches.find((m) => m.id === sandboxSession.tournamentMatchId);
    if (!currentMatch) {
      setSandboxSession((prev) => (prev ? { ...prev, resolved: true } : prev));
      return;
    }

    const fallbackWinnerId =
      currentMatch.leftId === me.id ? currentMatch.rightId : currentMatch.leftId;
    const winnerId = winnerUserId === me.id ? me.id : fallbackWinnerId;
    if (!winnerId) {
      setSandboxSession((prev) => (prev ? { ...prev, resolved: true } : prev));
      return;
    }

    let nextMatches = resolveTournamentMatch(tournamentRun.matches, currentMatch.id, winnerId);
    nextMatches = autoResolveTournamentMatches(nextMatches, tournamentRun.participants, me.id);
    const nextUserMatch = pickNextUserMatch(nextMatches, me.id);
    const championId = tournamentChampionId(nextMatches);

    if (championId === me.id) {
      applyProgressDelta({ coins: tournamentRun.pot });
      setTournamentRun({
        ...tournamentRun,
        matches: nextMatches,
        currentMatchId: null,
        status: "won"
      });
      setMenuNotice(
        `Tournament champion. Pot won: ${tournamentRun.pot} coins (entry ${tournamentRun.stake}).`
      );
      setSandboxSession((prev) => (prev ? { ...prev, resolved: true } : prev));
      return;
    }

    if (winnerId !== me.id || championId) {
      setTournamentRun({
        ...tournamentRun,
        matches: nextMatches,
        currentMatchId: null,
        status: championId ? "eliminated" : "active"
      });
      if (winnerId !== me.id) setMenuNotice("You were eliminated from the tournament.");
      else if (championId) setMenuNotice("Tournament completed.");
      setSandboxSession((prev) => (prev ? { ...prev, resolved: true } : prev));
      return;
    }

    if (!nextUserMatch) {
      setTournamentRun({
        ...tournamentRun,
        matches: nextMatches,
        currentMatchId: null,
        status: "active"
      });
      setSandboxSession((prev) => (prev ? { ...prev, resolved: true } : prev));
      return;
    }

    const nextOpponent = tournamentOpponent(tournamentRun.participants, nextUserMatch, me.id);
    setTournamentRun({
      ...tournamentRun,
      matches: nextMatches,
      currentMatchId: nextUserMatch.id,
      status: "active"
    });
    if (!nextOpponent) {
      setSandboxSession((prev) => (prev ? { ...prev, resolved: true } : prev));
      return;
    }

    setSandboxSession({
      key: Date.now(),
      kind: "tournament",
      difficulty: nextOpponent.difficulty,
      rewardCoins: 0,
      rewardXp: 0,
      opponentId: nextOpponent.id,
      opponentName: nextOpponent.name,
      tournamentMatchId: nextUserMatch.id,
      roundLabel: tournamentRoundLabel(nextUserMatch.round),
      resolved: false
    });
  }, [mode, sandboxSession, localState, me, tournamentRun]);

  useEffect(() => {
    if (mode !== "sandbox" || !localState || localReplay || !sandboxSession) return;
    if (localState.phase === "round_end" || localState.shotInProgress) return;
    const botTurn = localState.players[localState.currentTurn]?.userId === sandboxSession.opponentId;
    if (!botTurn) return;
    const cfg = BOT_CONFIG[sandboxSession.difficulty];

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
      const deliberateMiss = Math.random() < cfg.missChance;
      const missOffset = deliberateMiss ? (Math.random() - 0.5) * cfg.jitter * 2.8 : 0;
      const jitter = (Math.random() - 0.5) * cfg.jitter + missOffset;
      const targetPower = Math.hypot(target.pos.x - cue.pos.x, target.pos.y - cue.pos.y) / 420;
      const power = Math.max(cfg.powerMin, Math.min(cfg.powerMax, targetPower + (Math.random() - 0.5) * 0.15));
      onShoot({ angle: baseAngle + jitter, power, spin: { x: 0, y: 0 } });
    }, cfg.thinkMs);

    return () => window.clearTimeout(timeoutId);
  }, [mode, localState, localReplay, sandboxSession]);

  const currentState = mode === "online" ? socket.state : localState;
  const onlineResult = mode === "online" ? socket.result : null;
  const resolvedMyUserId = myLiveUserId ?? me?.id ?? null;

  useEffect(() => {
    if (!onlineResult) {
      handledResultMatchIdRef.current = null;
      setWinnerBalancePreview(null);
      return;
    }
    if (handledResultMatchIdRef.current === onlineResult.matchId) return;
    handledResultMatchIdRef.current = onlineResult.matchId;

    const iWon = Boolean(resolvedMyUserId && onlineResult.winnerUserId === resolvedMyUserId);
    const startCoins = me?.stats?.coins ?? 0;
    const prizeCoins = Math.max(0, onlineResult.potCoins ?? 0);
    if (!iWon || prizeCoins <= 0) {
      setWinnerBalancePreview(null);
      return;
    }

    const targetCoins = startCoins + prizeCoins;
    const durationMs = 1250;
    const startedAt = performance.now();
    let raf = 0;
    const animate = (ts: number) => {
      const p = Math.max(0, Math.min(1, (ts - startedAt) / durationMs));
      const eased = 1 - Math.pow(1 - p, 3);
      setWinnerBalancePreview(Math.round(startCoins + (targetCoins - startCoins) * eased));
      if (p < 1) {
        raf = window.requestAnimationFrame(animate);
      }
    };
    raf = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [onlineResult, me?.stats?.coins, resolvedMyUserId]);

  useEffect(() => {
    if (!onlineResult) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await api<{ user: Me }>("/api/profile");
          if (cancelled) return;
          setMe(res.user);
          window.localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(res.user));
        } catch {
          // Keep current cached profile on transient sync failures.
        }
      })();
    }, 1650);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [onlineResult]);

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
    setLocalReplay({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      frames,
      fps,
      startAtMs: Date.now() + 10
    });
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

  if (menuView !== "game") {
    const selectedStakeIdx = Math.max(
      0,
      STAKE_OPTIONS.findIndex((stake) => stake === selectedStake)
    );
    const tournamentMatches = tournamentRun
      ? {
          quarter: tournamentRun.matches.filter((m) => m.round === 1),
          semi: tournamentRun.matches.filter((m) => m.round === 2),
          final: tournamentRun.matches.filter((m) => m.round === 3)
        }
      : null;

    return (
      <main className="mx-auto min-h-screen w-full max-w-[1600px] px-2 pb-6 pt-2 md:px-4">
        <section className="relative overflow-hidden rounded-3xl border border-[#f4d46a]/40 bg-gradient-to-b from-[#67d4ff] via-[#9ee8ff] to-[#7adf7f] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.35)] md:p-6">
          <div className="pointer-events-none absolute inset-x-0 top-2 mx-auto h-56 w-[85%] rounded-[120px] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.78)_0%,rgba(255,255,255,0.16)_52%,rgba(255,255,255,0)_75%)]" />
          <div className="absolute -left-12 top-16 h-56 w-56 rounded-full bg-[#3a9f48]/35 blur-2xl" />
          <div className="absolute -right-12 bottom-8 h-52 w-52 rounded-full bg-[#2d8a3f]/30 blur-2xl" />

          <div className="relative z-10 rounded-2xl border border-[#8b4b12]/55 bg-gradient-to-r from-[#7c3608] via-[#a7571c] to-[#7c3608] p-2.5 text-white shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold tracking-wide">Eightball Arena</div>
              <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
                <span className="rounded-md bg-black/30 px-2 py-1">Level {level}</span>
                <span className="rounded-md bg-black/30 px-2 py-1">Coins {(me.stats?.coins ?? 0).toLocaleString()}</span>
                <span className="rounded-md bg-black/30 px-2 py-1">Cash {(me.stats?.cash ?? 0).toLocaleString()}</span>
                <span className="rounded-md bg-black/30 px-2 py-1">Streak {(me.stats?.winStreak ?? 0)}W</span>
                <button
                  onClick={async () => {
                    await api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
                    window.localStorage.removeItem(SESSION_CACHE_KEY);
                    setMe(null);
                  }}
                  className="rounded-md bg-black/35 px-2 py-1"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => setMenuView("main")}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold ${menuView === "main" ? "border-[#1f6cc3] bg-[#58b5ff] text-[#042a47]" : "border-white/40 bg-white/30 text-[#0b385f]"}`}
            >
              Menu
            </button>
            <button
              onClick={() => setMenuView("oneVOne")}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold ${menuView === "oneVOne" ? "border-[#1f6cc3] bg-[#58b5ff] text-[#042a47]" : "border-white/40 bg-white/30 text-[#0b385f]"}`}
            >
              1v1
            </button>
            <button
              onClick={() => setMenuView("tournaments")}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold ${menuView === "tournaments" ? "border-[#1f6cc3] bg-[#58b5ff] text-[#042a47]" : "border-white/40 bg-white/30 text-[#0b385f]"}`}
            >
              Tournaments
            </button>
            <button
              onClick={() => setMenuView("bots")}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold ${menuView === "bots" ? "border-[#1f6cc3] bg-[#58b5ff] text-[#042a47]" : "border-white/40 bg-white/30 text-[#0b385f]"}`}
            >
              VS Bots
            </button>
          </div>

          {menuNotice && (
            <div className="relative z-10 mt-3 rounded-xl border border-amber-300/80 bg-[#6f3f11]/85 px-3 py-2 text-sm text-amber-100">
              {menuNotice}
            </div>
          )}

          {menuView === "main" && (
            <div className="relative z-10 mt-6 grid gap-4 md:grid-cols-3">
              <MenuTile
                title="1v1 Duel"
                subtitle="Queue for real-time online matches"
                actionLabel="Enter 1v1"
                onClick={() => setMenuView("oneVOne")}
                accentClass="from-[#ffd33e] to-[#f2a300]"
              />
              <MenuTile
                title="Tournaments"
                subtitle="8 players, pyramid bracket, winner takes the pot"
                actionLabel="Open Bracket"
                onClick={() => setMenuView("tournaments")}
                accentClass="from-[#ffdb5e] to-[#f69b2e]"
              />
              <MenuTile
                title="VS Bots"
                subtitle="Practice against AI with difficulty rewards"
                actionLabel="Fight Bots"
                onClick={() => setMenuView("bots")}
                accentClass="from-[#ffe680] to-[#f1c232]"
              />
            </div>
          )}

          {menuView === "oneVOne" && (
            <div className="relative z-10 mx-auto mt-6 max-w-3xl rounded-2xl border border-[#a7671d] bg-gradient-to-b from-[#ffd958] to-[#f5ba24] p-5 shadow-[0_18px_36px_rgba(93,41,6,0.35)]">
              <div className="text-lg font-extrabold text-[#5a2602]">Online 1v1 Matchmaking</div>
              <p className="mt-1 text-sm text-[#6b3405]/80">Pick your stake and queue into a live head-to-head game.</p>
              <div className="mt-5 rounded-xl bg-[#7a3f10]/15 p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#5a2602]/85">Stake</div>
                <input
                  type="range"
                  min={0}
                  max={STAKE_OPTIONS.length - 1}
                  step={1}
                  value={selectedStakeIdx}
                  onChange={(e) => setSelectedStake(STAKE_OPTIONS[Number(e.target.value)] ?? 10)}
                  className="w-full accent-[#2f8c2d]"
                />
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {STAKE_OPTIONS.map((stake) => (
                    <button
                      key={`stake-chip-${stake}`}
                      onClick={() => setSelectedStake(stake)}
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${selectedStake === stake ? "bg-[#2f8c2d] text-white" : "bg-white/60 text-[#5a2602]"}`}
                    >
                      {stake}
                    </button>
                  ))}
                </div>
                <div className="mt-4 text-center text-2xl font-black text-[#5a2602]">{selectedStake} coins</div>
              </div>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button
                  onClick={startOneVOneMenuFlow}
                  className="rounded-xl bg-gradient-to-b from-[#53cf2f] to-[#2d8d22] px-8 py-3 text-lg font-extrabold text-white shadow-[0_10px_20px_rgba(26,89,20,0.35)]"
                >
                  PLAY
                </button>
                <button
                  onClick={() => setMenuView("main")}
                  className="rounded-xl bg-[#7b3f11] px-5 py-3 text-sm font-semibold text-white"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {menuView === "tournaments" && (
            <div className="relative z-10 mt-6 rounded-2xl border border-[#a7671d] bg-gradient-to-b from-[#ffd958] to-[#f5ba24] p-5 shadow-[0_18px_36px_rgba(93,41,6,0.35)]">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="text-lg font-extrabold text-[#5a2602]">Tournaments</div>
                  <p className="text-sm text-[#6b3405]/80">
                    8-player bracket: 4 quarterfinals, 2 semifinals, 1 final.
                  </p>
                </div>
                <div className="text-sm font-semibold text-[#5a2602]">
                  Pot: {selectedTournamentStake * 8} coins
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {TOURNAMENT_STAKES.map((stake) => (
                  <button
                    key={`tour-stake-${stake}`}
                    onClick={() => setSelectedTournamentStake(stake)}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold ${selectedTournamentStake === stake ? "bg-[#2f8c2d] text-white" : "bg-white/65 text-[#5a2602]"}`}
                  >
                    {stake}
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <TournamentBracket
                  run={tournamentRun}
                  meId={me.id}
                  quarterMatches={tournamentMatches?.quarter ?? []}
                  semiMatches={tournamentMatches?.semi ?? []}
                  finalMatches={tournamentMatches?.final ?? []}
                />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={startTournament}
                  className="rounded-xl bg-gradient-to-b from-[#53cf2f] to-[#2d8d22] px-6 py-3 text-base font-extrabold text-white shadow-[0_10px_20px_rgba(26,89,20,0.35)]"
                >
                  {tournamentRun?.status === "active" ? "Restart Tournament" : "Enter Tournament"}
                </button>
                <button
                  onClick={() => setMenuView("main")}
                  className="rounded-xl bg-[#7b3f11] px-5 py-3 text-sm font-semibold text-white"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {menuView === "bots" && (
            <div className="relative z-10 mt-6 grid gap-3 md:grid-cols-2">
              {(Object.keys(BOT_CONFIG) as BotDifficulty[]).map((difficulty) => {
                const cfg = BOT_CONFIG[difficulty];
                return (
                  <div
                    key={`bot-card-${difficulty}`}
                    className="rounded-2xl border border-[#a7671d] bg-gradient-to-b from-[#ffd958] to-[#f5ba24] p-4 shadow-[0_18px_36px_rgba(93,41,6,0.35)]"
                  >
                    <div className="text-lg font-extrabold text-[#5a2602]">{cfg.label}</div>
                    <div className="text-sm text-[#6b3405]/80">
                      Reward on win: {cfg.reward} {cfg.reward === 1 ? "coin" : "coins"} + {cfg.xpReward} EXP
                    </div>
                    <button
                      onClick={() => startBotsMatch(difficulty)}
                      className="mt-4 rounded-xl bg-gradient-to-b from-[#53cf2f] to-[#2d8d22] px-5 py-2.5 text-sm font-extrabold text-white"
                    >
                      Play {cfg.label}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
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
            <button
              onClick={() => {
                window.location.href = "/table-tool";
              }}
              className="rounded-md bg-white/10 px-2.5 py-1.5 text-xs text-white md:text-sm"
            >
              Table Tool
            </button>
            <button
              onClick={() => {
                arenaAudio.uiTap();
                openMainMenu();
              }}
              className="rounded-md bg-brass px-2.5 py-1.5 text-xs text-slate md:text-sm"
            >
              Main Menu
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
          <span className="rounded bg-rose-400/20 px-2 py-1 text-rose-200">Streak: {(me.stats?.winStreak ?? 0)}W</span>
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
            myUserId={myLiveUserId}
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
            remotePresence={mode === "online" ? opponentPresence : null}
            onPresenceUpdate={
              mode === "online"
                ? (payload) => {
                    socket.sendPresence(payload);
                  }
                : undefined
            }
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

      {onlineResult && currentState && resolvedMyUserId && (
        <MatchResultOverlay
          result={onlineResult}
          players={currentState.players}
          myUserId={resolvedMyUserId}
          myCoins={me.stats?.coins ?? 0}
          winnerBalancePreview={winnerBalancePreview}
          onRematch={socket.rematch}
          onMainMenu={openMainMenu}
        />
      )}

      <CustomizationMenu
        open={lockerOpen}
        selectedCueIndex={cueIndex}
        selectedTableIndex={tableIndex}
        cues={CUE_STYLES}
        tables={TABLE_SKINS}
        ownedCueIds={me.stats?.ownedCueIds ?? ["cue_classic"]}
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

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function botSkillScore(difficulty: BotDifficulty): number {
  switch (difficulty) {
    case "easy":
      return 1;
    case "normal":
      return 2;
    case "hard":
      return 3;
    case "pro":
      return 4;
    default:
      return 2;
  }
}

function tournamentRoundLabel(round: TournamentRound): string {
  if (round === 1) return "Quarterfinal";
  if (round === 2) return "Semifinal";
  return "Final";
}

function createTournamentRun(me: Me, stake: number): TournamentRun {
  const botPool = [
    { id: "tour_bot_1", name: "Lynx", difficulty: "normal" as BotDifficulty },
    { id: "tour_bot_2", name: "Breaker", difficulty: "hard" as BotDifficulty },
    { id: "tour_bot_3", name: "Ghost", difficulty: "easy" as BotDifficulty },
    { id: "tour_bot_4", name: "Swerve", difficulty: "normal" as BotDifficulty },
    { id: "tour_bot_5", name: "Viper", difficulty: "hard" as BotDifficulty },
    { id: "tour_bot_6", name: "Atlas", difficulty: "pro" as BotDifficulty },
    { id: "tour_bot_7", name: "Comet", difficulty: "normal" as BotDifficulty }
  ];

  const entrants = shuffle([
    {
      id: me.id,
      name: me.username,
      difficulty: "normal" as BotDifficulty,
      isUser: true
    },
    ...botPool.map((b) => ({ ...b, isUser: false }))
  ]);

  const quarter: TournamentMatch[] = [
    {
      id: "q1",
      round: 1,
      leftId: entrants[0]?.id ?? null,
      rightId: entrants[1]?.id ?? null,
      leftSourceId: null,
      rightSourceId: null,
      winnerId: null,
      status: "pending"
    },
    {
      id: "q2",
      round: 1,
      leftId: entrants[2]?.id ?? null,
      rightId: entrants[3]?.id ?? null,
      leftSourceId: null,
      rightSourceId: null,
      winnerId: null,
      status: "pending"
    },
    {
      id: "q3",
      round: 1,
      leftId: entrants[4]?.id ?? null,
      rightId: entrants[5]?.id ?? null,
      leftSourceId: null,
      rightSourceId: null,
      winnerId: null,
      status: "pending"
    },
    {
      id: "q4",
      round: 1,
      leftId: entrants[6]?.id ?? null,
      rightId: entrants[7]?.id ?? null,
      leftSourceId: null,
      rightSourceId: null,
      winnerId: null,
      status: "pending"
    }
  ];

  const semi: TournamentMatch[] = [
    {
      id: "s1",
      round: 2,
      leftId: null,
      rightId: null,
      leftSourceId: "q1",
      rightSourceId: "q2",
      winnerId: null,
      status: "pending"
    },
    {
      id: "s2",
      round: 2,
      leftId: null,
      rightId: null,
      leftSourceId: "q3",
      rightSourceId: "q4",
      winnerId: null,
      status: "pending"
    }
  ];

  const final: TournamentMatch[] = [
    {
      id: "f1",
      round: 3,
      leftId: null,
      rightId: null,
      leftSourceId: "s1",
      rightSourceId: "s2",
      winnerId: null,
      status: "pending"
    }
  ];

  return {
    id: `tour_${Date.now()}`,
    stake,
    pot: stake * 8,
    participants: entrants,
    matches: [...quarter, ...semi, ...final],
    currentMatchId: null,
    status: "active"
  };
}

function hydrateMatchSlots(matches: TournamentMatch[]): TournamentMatch[] {
  const byId = new Map(matches.map((m) => [m.id, m]));
  return matches.map((match) => {
    let leftId = match.leftId;
    let rightId = match.rightId;
    if (match.leftSourceId) leftId = byId.get(match.leftSourceId)?.winnerId ?? null;
    if (match.rightSourceId) rightId = byId.get(match.rightSourceId)?.winnerId ?? null;
    return {
      ...match,
      leftId,
      rightId
    };
  });
}

function autoResolveTournamentMatches(
  matches: TournamentMatch[],
  participants: TournamentParticipant[],
  userId: string
): TournamentMatch[] {
  const participantById = new Map(participants.map((p) => [p.id, p]));
  let next = matches.map((m) => ({ ...m }));
  let changed = true;

  while (changed) {
    changed = false;
    next = hydrateMatchSlots(next);
    for (const match of next) {
      if (match.winnerId || !match.leftId || !match.rightId) continue;
      if (match.leftId === userId || match.rightId === userId) continue;
      const left = participantById.get(match.leftId);
      const right = participantById.get(match.rightId);
      if (!left || !right) continue;

      const leftSkill = botSkillScore(left.difficulty);
      const rightSkill = botSkillScore(right.difficulty);
      const total = leftSkill + rightSkill;
      const leftWin = Math.random() < leftSkill / total;
      match.winnerId = leftWin ? left.id : right.id;
      match.status = "done";
      changed = true;
    }
  }

  return next;
}

function pickNextUserMatch(matches: TournamentMatch[], userId: string): TournamentMatch | null {
  return (
    matches.find(
      (match) =>
        !match.winnerId &&
        Boolean(match.leftId) &&
        Boolean(match.rightId) &&
        (match.leftId === userId || match.rightId === userId)
    ) ?? null
  );
}

function resolveTournamentMatch(
  matches: TournamentMatch[],
  matchId: string,
  winnerId: string
): TournamentMatch[] {
  return matches.map((match) =>
    match.id === matchId
      ? {
          ...match,
          winnerId,
          status: "done"
        }
      : match
  );
}

function tournamentChampionId(matches: TournamentMatch[]): string | null {
  return matches.find((match) => match.round === 3)?.winnerId ?? null;
}

function tournamentOpponent(
  participants: TournamentParticipant[],
  match: TournamentMatch,
  userId: string
): TournamentParticipant | null {
  const opponentId = match.leftId === userId ? match.rightId : match.leftId;
  if (!opponentId) return null;
  return participants.find((p) => p.id === opponentId) ?? null;
}

function formatParticipantName(
  run: TournamentRun | null,
  id: string | null,
  meId: string
): string {
  if (!id || !run) return "TBD";
  const participant = run.participants.find((p) => p.id === id);
  if (!participant) return "TBD";
  return participant.id === meId ? `${participant.name} (You)` : participant.name;
}

function MenuTile({
  title,
  subtitle,
  actionLabel,
  accentClass,
  onClick
}: {
  title: string;
  subtitle: string;
  actionLabel: string;
  accentClass: string;
  onClick: () => void;
}) {
  return (
    <article className={`rounded-2xl border border-[#a7671d] bg-gradient-to-b ${accentClass} p-4 shadow-[0_18px_36px_rgba(93,41,6,0.35)]`}>
      <h3 className="text-xl font-extrabold text-[#5a2602]">{title}</h3>
      <p className="mt-1 text-sm text-[#6b3405]/80">{subtitle}</p>
      <button
        onClick={onClick}
        className="mt-4 rounded-xl bg-gradient-to-b from-[#53cf2f] to-[#2d8d22] px-5 py-2.5 text-sm font-extrabold text-white"
      >
        {actionLabel}
      </button>
    </article>
  );
}

function TournamentBracket({
  run,
  meId,
  quarterMatches,
  semiMatches,
  finalMatches
}: {
  run: TournamentRun | null;
  meId: string;
  quarterMatches: TournamentMatch[];
  semiMatches: TournamentMatch[];
  finalMatches: TournamentMatch[];
}) {
  const MatchBox = ({ match }: { match: TournamentMatch }) => (
    <div className={`rounded-lg border px-2 py-2 text-xs ${match.status === "done" ? "border-emerald-300/70 bg-emerald-100/35" : "border-white/60 bg-white/35"}`}>
      <div>{formatParticipantName(run, match.leftId, meId)}</div>
      <div className="mt-1">{formatParticipantName(run, match.rightId, meId)}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-[#5a2602]/75">
        {tournamentRoundLabel(match.round)}
      </div>
      <div className="text-[10px] font-semibold text-[#5a2602]/85">
        Winner: {formatParticipantName(run, match.winnerId, meId)}
      </div>
    </div>
  );

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[#5a2602]/70">Quarterfinals</div>
        {quarterMatches.length > 0 ? (
          quarterMatches.map((match) => <MatchBox key={`quarter-${match.id}`} match={match} />)
        ) : (
          <div className="rounded-lg border border-white/50 bg-white/30 px-2 py-2 text-xs text-[#5a2602]">No bracket yet</div>
        )}
      </div>
      <div className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[#5a2602]/70">Semifinals</div>
        {semiMatches.length > 0 ? (
          semiMatches.map((match) => <MatchBox key={`semi-${match.id}`} match={match} />)
        ) : (
          <div className="rounded-lg border border-white/50 bg-white/30 px-2 py-2 text-xs text-[#5a2602]">No bracket yet</div>
        )}
      </div>
      <div className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[#5a2602]/70">Final</div>
        {finalMatches.length > 0 ? (
          finalMatches.map((match) => <MatchBox key={`final-${match.id}`} match={match} />)
        ) : (
          <div className="rounded-lg border border-white/50 bg-white/30 px-2 py-2 text-xs text-[#5a2602]">No bracket yet</div>
        )}
      </div>
    </div>
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

function MatchResultOverlay({
  result,
  players,
  myUserId,
  myCoins,
  winnerBalancePreview,
  onRematch,
  onMainMenu
}: {
  result: { matchId: string; winnerUserId: string | null; reason: string; stakeCoins: number; potCoins: number };
  players: [PlayerState, PlayerState];
  myUserId: string;
  myCoins: number;
  winnerBalancePreview: number | null;
  onRematch: () => void;
  onMainMenu: () => void;
}) {
  const winner = result.winnerUserId ? players.find((p) => p.userId === result.winnerUserId) ?? null : null;
  const loser = winner ? players.find((p) => p.userId !== winner.userId) ?? null : null;
  const podiumPlayers = winner ? [winner, loser].filter((p): p is PlayerState => Boolean(p)) : [...players];
  const didIWin = Boolean(winner && winner.userId === myUserId);
  const headline = winner ? (didIWin ? "You Won" : "Match Lost") : "Draw";

  const winnerBalanceText = (() => {
    if (!winner) return "-";
    if (winner.userId === myUserId) {
      return (winnerBalancePreview ?? myCoins).toLocaleString();
    }
    return `+${Math.max(0, result.potCoins).toLocaleString()}`;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030912]/78 px-3 backdrop-blur-[3px]">
      <div className="w-full max-w-3xl rounded-2xl border border-[#e2bb63]/45 bg-gradient-to-b from-[#0e2032] via-[#10253a] to-[#091725] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.55)] md:p-5">
        <div className="text-center">
          <h2 className="text-2xl font-black tracking-wide text-[#ffe190]">{headline}</h2>
          <p className="mt-1 text-sm text-white/75">
            {winner ? `Winner takes ${result.potCoins.toLocaleString()} coins` : "No winner for this round"}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wider text-white/50">Reason: {result.reason}</p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {podiumPlayers.map((player) => {
            const isWinner = Boolean(winner && player.userId === winner.userId);
            const avatarInitial = (player.username || "?").slice(0, 1).toUpperCase();
            return (
              <div
                key={`result-${player.userId}`}
                className={`relative overflow-hidden rounded-xl border p-3 ${
                  isWinner ? "border-amber-300/70 bg-amber-300/10" : "border-white/20 bg-white/5"
                }`}
              >
                {isWinner && (
                  <div className="absolute right-2 top-2 rounded-full bg-amber-300/20 p-1.5 text-amber-200">
                    <CrownIcon />
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 overflow-hidden rounded-full border border-white/30 bg-white/10">
                    {player.avatarUrl ? (
                      <div
                        aria-label={player.username}
                        className="h-full w-full bg-cover bg-center bg-no-repeat"
                        style={{ backgroundImage: `url(${player.avatarUrl})` }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg font-bold text-white/90">
                        {avatarInitial}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-base font-bold text-white">{player.username}</div>
                    <div className={`text-xs ${isWinner ? "text-amber-200/90" : "text-white/70"}`}>
                      {isWinner ? "Winner" : "Runner-up"}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-[11px] uppercase tracking-wide text-white/60">Balance</div>
                <div className="relative mt-1 rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm font-semibold text-white">
                  {isWinner ? winnerBalanceText : player.userId === myUserId ? myCoins.toLocaleString() : "-"}
                  {isWinner && (
                    <div className="arena-coin-stream" aria-hidden>
                      {Array.from({ length: 9 }).map((_, idx) => (
                        <span
                          key={`coin-${result.matchId}-${idx}`}
                          className="arena-coin-token"
                          style={
                            {
                              "--coin-left": `${14 + idx * 8}%`,
                              "--coin-delay": `${idx * 100}ms`
                            } as Record<string, string>
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={onRematch}
            className="rounded-xl bg-gradient-to-b from-[#52cf2e] to-[#2d8e22] px-5 py-2 text-sm font-extrabold text-white"
          >
            Rematch
          </button>
          <button
            onClick={onMainMenu}
            className="rounded-xl bg-white/10 px-5 py-2 text-sm font-semibold text-white"
          >
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

function CrownIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 18L6.4 7.5L12 12L17.6 7.5L20 18H4Z" fill="currentColor" />
      <circle cx="6.4" cy="7.3" r="1.6" fill="currentColor" />
      <circle cx="12" cy="5.2" r="1.6" fill="currentColor" />
      <circle cx="17.6" cy="7.3" r="1.6" fill="currentColor" />
      <rect x="4" y="18" width="16" height="2" rx="1" fill="currentColor" />
    </svg>
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
          <div className="flex min-w-0 items-center gap-2">
            <div className="h-9 w-9 overflow-hidden rounded-full border border-white/30 bg-white/10">
              {player.avatarUrl ? (
                <div
                  aria-label={player.username}
                  className="h-full w-full bg-cover bg-center bg-no-repeat"
                  style={{ backgroundImage: `url(${player.avatarUrl})` }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white/90">
                  {(player.username || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="truncate font-semibold">
              {player.username} ({group})
            </div>
          </div>
          <div className="text-[11px] text-white/75">Clock: {isActive ? `${remainingSec}s` : "30s"}</div>
        </div>
        <div className="text-xs">Can shoot 8: {canShoot8 ? "Yes" : "No"}</div>
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-white/80">
          <span>W/L: {player.profile?.wins ?? 0}/{player.profile?.losses ?? 0}</span>
          <span>Ratio: {ratioText(player.profile?.wins ?? 0, player.profile?.losses ?? 0)}</span>
          <span>Streak: {player.profile?.winStreak ?? 0}W</span>
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
