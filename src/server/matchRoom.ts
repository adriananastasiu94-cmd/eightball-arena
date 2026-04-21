import { Server } from "socket.io";
import { MatchState, PlayerState, ShotInput } from "@/game/types";
import { applyCueImpulse, simulateShot } from "@/game/physics/engine";
import { applyOutcomeToTurn, adjudicateShot } from "@/game/rules/eightBallRules";
import { createMatchState } from "@/game/state";
import { prisma } from "@/lib/prisma";
import { grantFallbackCoins } from "@/lib/fallbackWallet";

type ConnectedPlayer = {
  userId: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  socketId: string;
};

function canPlaceCueAt(state: MatchState, x: number, y: number): boolean {
  const cue = state.balls.find((b) => b.kind === "cue");
  if (!cue) return false;

  const left = state.table.rail + cue.radius;
  const right = state.table.width - state.table.rail - cue.radius;
  const top = state.table.rail + cue.radius;
  const bottom = state.table.height - state.table.rail - cue.radius;
  const clampedX = Math.max(left, Math.min(right, x));
  const clampedY = Math.max(top, Math.min(bottom, y));

  return state.balls.every((b) => {
    if (b.kind === "cue" || b.pocketed) return true;
    const minDist = cue.radius + b.radius + 0.5;
    return Math.hypot(b.pos.x - clampedX, b.pos.y - clampedY) >= minDist;
  });
}

export class MatchRoom {
  readonly id: string;
  readonly socketsByUser = new Map<string, string>();
  private rematchVotes = new Set<string>();
  private disconnectTimers = new Map<string, NodeJS.Timeout>();
  private shotUnlockTimer: NodeJS.Timeout | null = null;
  private shotClockTimer: NodeJS.Timeout | null = null;
  private readonly shotClockMs = 30000;
  private lastCueBroadcastAt = 0;
  private lastCueBroadcastPos: { x: number; y: number } | null = null;
  state: MatchState;

  constructor(
    private readonly io: Server,
    private readonly players: [ConnectedPlayer, ConnectedPlayer],
    private readonly onFinished: (roomId: string) => void,
    private readonly stakeCoins: number,
    private readonly potCoins: number
  ) {
    this.id = `room_${Math.random().toString(36).slice(2, 10)}`;
    players.forEach((p) => this.socketsByUser.set(p.userId, p.socketId));

    const statePlayers: [PlayerState, PlayerState] = [
      {
        userId: players[0].userId,
        username: players[0].username,
        avatarUrl: players[0].avatarUrl,
        group: null,
        wins: 0,
        profile: { wins: 0, losses: 0, matchesPlayed: 0, level: 1, region: "Global" }
      },
      {
        userId: players[1].userId,
        username: players[1].username,
        avatarUrl: players[1].avatarUrl,
        group: null,
        wins: 0,
        profile: { wins: 0, losses: 0, matchesPlayed: 0, level: 1, region: "Global" }
      }
    ];
    this.state = createMatchState(this.id, statePlayers);
    this.resetTurnDeadline();
  }

  attachSockets(): void {
    this.players.forEach((p, idx) => {
      this.io.to(p.socketId).emit("match:found", {
        matchId: this.id,
        opponent: {
          username: this.players[1 - idx].username,
          avatarUrl: this.players[1 - idx].avatarUrl
        }
      });
      this.io.sockets.sockets.get(p.socketId)?.join(this.id);
    });
    this.broadcastState();
    void this.hydratePlayerProfiles().catch(() => undefined);
  }

  handleReconnect(userId: string, socketId: string): boolean {
    if (!this.socketsByUser.has(userId)) return false;
    this.socketsByUser.set(userId, socketId);
    this.io.sockets.sockets.get(socketId)?.join(this.id);
    const timer = this.disconnectTimers.get(userId);
    if (timer) clearTimeout(timer);
    this.disconnectTimers.delete(userId);
    this.broadcastState();
    return true;
  }

  handleDisconnect(userId: string): void {
    if (!this.socketsByUser.has(userId)) return;
    const timer = setTimeout(() => {
      const winner = this.state.players.find((p) => p.userId !== userId)?.userId ?? null;
      this.finish(winner, "disconnect_timeout");
    }, 15000);
    this.disconnectTimers.set(userId, timer);
  }

  handleBallInHand(userId: string, x: number, y: number): void {
    const playerIndex = this.state.players.findIndex((p) => p.userId === userId);
    if (playerIndex !== this.state.currentTurn || !this.state.ballInHand || this.state.shotInProgress) return;
    const cue = this.state.balls.find((b) => b.kind === "cue");
    if (!cue) return;

    cue.pocketed = false;
    cue.vel = { x: 0, y: 0 };
    const nextPos = {
      x: Math.max(this.state.table.rail + cue.radius, Math.min(this.state.table.width - this.state.table.rail - cue.radius, x)),
      y: Math.max(this.state.table.rail + cue.radius, Math.min(this.state.table.height - this.state.table.rail - cue.radius, y))
    };
    if (!canPlaceCueAt(this.state, nextPos.x, nextPos.y)) return;
    if (Math.hypot(cue.pos.x - nextPos.x, cue.pos.y - nextPos.y) < 0.2) return;
    cue.pos = nextPos;

    const now = Date.now();
    const sinceLast = now - this.lastCueBroadcastAt;
    const distFromLast =
      this.lastCueBroadcastPos === null
        ? Number.POSITIVE_INFINITY
        : Math.hypot(nextPos.x - this.lastCueBroadcastPos.x, nextPos.y - this.lastCueBroadcastPos.y);
    if (sinceLast < 28 && distFromLast < 2.8) return;
    this.lastCueBroadcastAt = now;
    this.lastCueBroadcastPos = { ...nextPos };
    this.state.ballInHand = false;
    this.resetTurnDeadline();
    this.broadcastState();
  }

  handlePresence(
    userId: string,
    payload: { active: boolean; angle: number; power: number }
  ): void {
    if (!this.socketsByUser.has(userId)) return;
    if (!Number.isFinite(payload.angle) || !Number.isFinite(payload.power)) return;
    const power = Math.max(0.08, Math.min(1, payload.power));

    this.io.to(this.id).emit("match:presence", {
      userId,
      active: Boolean(payload.active),
      angle: payload.angle,
      power,
      t: Date.now()
    });
  }

  handleShot(userId: string, shot: ShotInput): void {
    if (this.state.phase === "round_end") return;
    if (this.state.shotInProgress) {
      this.io.to(this.socketsByUser.get(userId) ?? "").emit("match:shot-rejected", { reason: "Shot in progress" });
      return;
    }

    const playerIndex = this.state.players.findIndex((p) => p.userId === userId);
    if (playerIndex !== this.state.currentTurn) return;
    if (this.state.ballInHand) {
      this.io.to(this.socketsByUser.get(userId) ?? "").emit("match:shot-rejected", { reason: "Place cue ball first" });
      return;
    }

    if (!Number.isFinite(shot.angle) || !Number.isFinite(shot.power) || shot.power < 0.05 || shot.power > 1) {
      this.io.to(this.socketsByUser.get(userId) ?? "").emit("match:shot-rejected", { reason: "Invalid shot" });
      return;
    }

    this.state.shotInProgress = true;
    this.state.turnDeadlineMs = null;
    this.clearShotClockTimer();
    this.broadcastState();

    // Authoritative flow: validate -> simulate -> adjudicate rules -> broadcast one true state.
    const ballsAfterImpulse = applyCueImpulse(this.state.balls, shot.angle, shot.power, shot.spin);
    const sim = simulateShot(this.state.table, ballsAfterImpulse);
    const maxReplayFrames = 220;
    const sampleStep = Math.max(5, Math.ceil(sim.frames.length / maxReplayFrames));
    const replayFps = Math.max(12, Math.round(120 / sampleStep));
    const replayFrames = sim.frames
      .filter((_, idx) => idx % sampleStep === 0 || idx === sim.frames.length - 1)
      .map((frame) => frame.map((b) => ({ ...b, pos: { ...b.pos }, vel: { ...b.vel } })));
    const replayDurationMs = Math.max(300, Math.round((replayFrames.length / replayFps) * 1000));

    const pocketed = sim.events.filter((e) => e.type === "pocket").map((e) => e.ballId);
    const firstContactEvent = sim.events.find((e) => e.type === "first_contact") as { targetBallId: number } | undefined;
    const cuePocketed = sim.finalBalls.find((b) => b.kind === "cue")?.pocketed ?? false;
    const cushionHits = sim.events.filter((e) => e.type === "cushion").length;

    this.state.balls = sim.finalBalls;
    const outcome = adjudicateShot(this.state, {
      pocketed,
      firstContact: firstContactEvent?.targetBallId ?? null,
      scratched: cuePocketed,
      cushionHits,
      isBreakShot: !this.state.breakDone
    });
    applyOutcomeToTurn(this.state, outcome);

    this.io.to(this.id).emit("match:replay", {
      frames: replayFrames,
      fps: replayFps,
      durationMs: replayDurationMs,
      shotCount: this.state.shotCount
    });
    this.broadcastState();
    this.scheduleShotUnlock(replayDurationMs);

    if (outcome.winnerUserId) {
      this.finish(outcome.winnerUserId, outcome.legalEight ? "8_ball" : "foul_on_8");
    }
  }

  private scheduleShotUnlock(delayMs: number): void {
    if (this.shotUnlockTimer) clearTimeout(this.shotUnlockTimer);
    this.shotUnlockTimer = setTimeout(() => {
      this.state.shotInProgress = false;
      this.resetTurnDeadline();
      this.broadcastState();
    }, delayMs);
  }

  private async finish(winnerUserId: string | null, reason: string) {
    this.clearShotClockTimer();
    if (this.shotUnlockTimer) {
      clearTimeout(this.shotUnlockTimer);
      this.shotUnlockTimer = null;
    }
    this.state.shotInProgress = false;
    this.state.phase = "round_end";
    this.broadcastState();
    this.io.to(this.id).emit("match:ended", { winnerUserId, reason });

    try {
      const users = await prisma.user.findMany({
        where: { chatUserId: { in: this.state.players.map((p) => p.userId) } },
        select: { id: true, chatUserId: true }
      });
      const arenaUserByChat = new Map(users.map((u) => [u.chatUserId, u.id]));
      const winnerArenaUserId = winnerUserId ? arenaUserByChat.get(winnerUserId) ?? null : null;

      const match = await prisma.match.create({
        data: {
          status: "FINISHED",
          result:
            winnerUserId === null
              ? "DRAW"
              : this.state.players[0].userId === winnerUserId
                ? "PLAYER_ONE_WIN"
                : "PLAYER_TWO_WIN",
          completedAt: new Date(),
          winnerUserId: winnerArenaUserId,
          participants: {
            create: this.state.players
              .map((p, idx) => {
                const arenaUserId = arenaUserByChat.get(p.userId);
                if (!arenaUserId) return null;
                return {
                  userId: arenaUserId,
                  seat: idx,
                  solids: p.group === "solids",
                  isWinner: p.userId === winnerUserId
                };
              })
              .filter((p): p is { userId: string; seat: number; solids: boolean; isWinner: boolean } => p !== null)
          }
        }
      });

      for (const p of this.state.players) {
        const arenaUserId = arenaUserByChat.get(p.userId);
        if (!arenaUserId) continue;
        const coinsAward = p.userId === winnerUserId ? this.potCoins : 0;
        await prisma.playerStats.upsert({
          where: { userId: arenaUserId },
          create: {
            userId: arenaUserId,
            wins: p.userId === winnerUserId ? 1 : 0,
            losses: p.userId !== winnerUserId ? 1 : 0,
            matchesPlayed: 1,
            rating: 1000 + (p.userId === winnerUserId ? 10 : -10),
            xp: p.userId === winnerUserId ? 280 : 140,
            coins: 1000 + coinsAward,
            cash: 200 + (p.userId === winnerUserId ? 2 : 1)
          },
          update: {
            wins: { increment: p.userId === winnerUserId ? 1 : 0 },
            losses: { increment: p.userId !== winnerUserId ? 1 : 0 },
            matchesPlayed: { increment: 1 },
            rating: { increment: p.userId === winnerUserId ? 10 : -10 },
            xp: { increment: p.userId === winnerUserId ? 280 : 140 },
            coins: { increment: coinsAward },
            cash: { increment: p.userId === winnerUserId ? 2 : 1 }
          }
        });

        await prisma.matchHistory.create({
          data: {
            userId: arenaUserId,
            matchId: match.id,
            summary:
              p.userId === winnerUserId
                ? `Victory by ${reason} (+${this.potCoins} coins from ${this.stakeCoins} stake)`
                : `Defeat by ${reason} (-${this.stakeCoins} coins stake)`
          }
        });
      }
    } catch (error) {
      console.error("match finish persistence failed", error);
      if (winnerUserId) {
        const winner = this.players.find((p) => p.userId === winnerUserId);
        if (winner?.email) {
          await grantFallbackCoins(winner.email, this.potCoins).catch(() => undefined);
        }
      }
    } finally {
      this.onFinished(this.id);
    }
  }

  handleRematch(userId: string): void {
    this.rematchVotes.add(userId);
    if (this.rematchVotes.size === 2) {
      const players: [PlayerState, PlayerState] = [
        { ...this.state.players[0], group: null },
        { ...this.state.players[1], group: null }
      ];
      this.state = createMatchState(this.id, players);
      this.state.timeoutStrikes = [0, 0];
      this.resetTurnDeadline();
      this.rematchVotes.clear();
      this.broadcastState();
    }
  }

  private resetTurnDeadline(): void {
    this.state.turnDeadlineMs = Date.now() + this.shotClockMs;
    this.armShotClockTimer();
  }

  private clearShotClockTimer(): void {
    if (!this.shotClockTimer) return;
    clearTimeout(this.shotClockTimer);
    this.shotClockTimer = null;
  }

  private armShotClockTimer(): void {
    this.clearShotClockTimer();
    const deadline = this.state.turnDeadlineMs;
    if (!deadline) return;
    const delay = Math.max(20, deadline - Date.now());
    this.shotClockTimer = setTimeout(() => this.handleTurnTimeout(), delay);
  }

  private handleTurnTimeout(): void {
    if (this.state.phase === "round_end") return;
    if (this.state.shotInProgress) return;
    const deadline = this.state.turnDeadlineMs;
    if (!deadline) return;
    const remaining = deadline - Date.now();
    if (remaining > 20) {
      this.armShotClockTimer();
      return;
    }

    const offender = this.state.currentTurn;
    const strikes = [...this.state.timeoutStrikes] as [number, number];
    strikes[offender] += 1;
    this.state.timeoutStrikes = strikes;

    if (strikes[offender] >= 3) {
      const winner = this.state.players[1 - offender]?.userId ?? null;
      void this.finish(winner, "shot_clock_forfeit");
      return;
    }

    this.state.lastOutcome = {
      foul: true,
      scratched: false,
      pocketed: [],
      firstContact: null,
      turnContinues: false,
      winnerUserId: null,
      legalEight: false,
      reason: "Shot clock violation"
    };
    this.state.ballInHand = true;
    this.state.currentTurn = 1 - offender;
    this.state.breakDone = true;
    if (this.state.phase === "breaking") this.state.phase = "playing";
    this.resetTurnDeadline();
    this.broadcastState();
  }

  private async hydratePlayerProfiles(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { chatUserId: { in: this.players.map((p) => p.userId) } },
      include: { playerStats: true }
    });
    if (users.length === 0) return;

    const byChatId = new Map(users.map((u) => [u.chatUserId, u]));
    this.state.players = this.state.players.map((p) => {
      const user = byChatId.get(p.userId);
      return {
        ...p,
        avatarUrl: user?.avatarUrl ?? p.avatarUrl ?? null,
        profile: {
          wins: user?.playerStats?.wins ?? 0,
          losses: user?.playerStats?.losses ?? 0,
          matchesPlayed: user?.playerStats?.matchesPlayed ?? 0,
          level: user?.playerStats?.level ?? 1,
          region: "Global"
        }
      };
    }) as [PlayerState, PlayerState];

    this.broadcastState();
  }

  private broadcastState() {
    this.io.to(this.id).emit("match:state", { state: this.state, serverTime: Date.now() });
  }
}
