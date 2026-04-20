import { Server } from "socket.io";
import { MatchState, PlayerState, ShotInput } from "@/game/types";
import { applyCueImpulse, simulateShot } from "@/game/physics/engine";
import { applyOutcomeToTurn, adjudicateShot } from "@/game/rules/eightBallRules";
import { createMatchState } from "@/game/state";
import { prisma } from "@/lib/prisma";

type ConnectedPlayer = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  socketId: string;
};

export class MatchRoom {
  readonly id: string;
  readonly socketsByUser = new Map<string, string>();
  private rematchVotes = new Set<string>();
  private disconnectTimers = new Map<string, NodeJS.Timeout>();
  state: MatchState;

  constructor(
    private readonly io: Server,
    private readonly players: [ConnectedPlayer, ConnectedPlayer],
    private readonly onFinished: (roomId: string) => void
  ) {
    this.id = `room_${Math.random().toString(36).slice(2, 10)}`;
    players.forEach((p) => this.socketsByUser.set(p.userId, p.socketId));

    const statePlayers: [PlayerState, PlayerState] = [
      { userId: players[0].userId, username: players[0].username, group: null, wins: 0 },
      { userId: players[1].userId, username: players[1].username, group: null, wins: 0 }
    ];
    this.state = createMatchState(this.id, statePlayers);
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
    if (playerIndex !== this.state.currentTurn || !this.state.ballInHand) return;
    const cue = this.state.balls.find((b) => b.kind === "cue");
    if (!cue) return;

    cue.pocketed = false;
    cue.vel = { x: 0, y: 0 };
    cue.pos = {
      x: Math.max(this.state.table.rail + cue.radius, Math.min(this.state.table.width - this.state.table.rail - cue.radius, x)),
      y: Math.max(this.state.table.rail + cue.radius, Math.min(this.state.table.height - this.state.table.rail - cue.radius, y))
    };
    this.broadcastState();
  }

  handleShot(userId: string, shot: ShotInput): void {
    if (this.state.phase === "round_end") return;
    const playerIndex = this.state.players.findIndex((p) => p.userId === userId);
    if (playerIndex !== this.state.currentTurn) return;

    if (!Number.isFinite(shot.angle) || !Number.isFinite(shot.power) || shot.power < 0.05 || shot.power > 1) {
      this.io.to(this.socketsByUser.get(userId) ?? "").emit("match:shot-rejected", { reason: "Invalid shot" });
      return;
    }

    // Authoritative flow: validate -> simulate -> adjudicate rules -> broadcast one true state.
    const ballsAfterImpulse = applyCueImpulse(this.state.balls, shot.angle, shot.power, shot.spin);
    const sim = simulateShot(this.state.table, ballsAfterImpulse);

    const pocketed = sim.events.filter((e) => e.type === "pocket").map((e) => e.ballId);
    const firstContactEvent = sim.events.find((e) => e.type === "first_contact") as { targetBallId: number } | undefined;
    const cuePocketed = sim.finalBalls.find((b) => b.kind === "cue")?.pocketed ?? false;

    this.state.balls = sim.finalBalls;
    const outcome = adjudicateShot(this.state, {
      pocketed,
      firstContact: firstContactEvent?.targetBallId ?? null,
      scratched: cuePocketed
    });
    applyOutcomeToTurn(this.state, outcome);

    this.broadcastState();

    if (outcome.winnerUserId) {
      this.finish(outcome.winnerUserId, outcome.legalEight ? "8_ball" : "foul_on_8");
    }
  }

  private async finish(winnerUserId: string | null, reason: string) {
    this.state.phase = "round_end";
    this.broadcastState();
    this.io.to(this.id).emit("match:ended", { winnerUserId, reason });

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
        winnerUserId,
        participants: {
          create: this.state.players.map((p, idx) => ({
            userId: p.userId,
            seat: idx,
            solids: p.group === "solids",
            isWinner: p.userId === winnerUserId
          }))
        }
      }
    });

    for (const p of this.state.players) {
      await prisma.playerStats.upsert({
        where: { userId: p.userId },
        create: {
          userId: p.userId,
          wins: p.userId === winnerUserId ? 1 : 0,
          losses: p.userId !== winnerUserId ? 1 : 0,
          matchesPlayed: 1,
          rating: 1000 + (p.userId === winnerUserId ? 10 : -10)
        },
        update: {
          wins: { increment: p.userId === winnerUserId ? 1 : 0 },
          losses: { increment: p.userId !== winnerUserId ? 1 : 0 },
          matchesPlayed: { increment: 1 },
          rating: { increment: p.userId === winnerUserId ? 10 : -10 }
        }
      });

      await prisma.matchHistory.create({
        data: {
          userId: p.userId,
          matchId: match.id,
          summary: p.userId === winnerUserId ? `Victory by ${reason}` : `Defeat by ${reason}`
        }
      });
    }

    this.onFinished(this.id);
  }

  handleRematch(userId: string): void {
    this.rematchVotes.add(userId);
    if (this.rematchVotes.size === 2) {
      const players: [PlayerState, PlayerState] = [
        { ...this.state.players[0], group: null },
        { ...this.state.players[1], group: null }
      ];
      this.state = createMatchState(this.id, players);
      this.rematchVotes.clear();
      this.broadcastState();
    }
  }

  private broadcastState() {
    this.io.to(this.id).emit("match:state", { state: this.state, serverTime: Date.now() });
  }
}
