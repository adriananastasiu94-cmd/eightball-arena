import { Server } from "socket.io";
import { MatchRoom } from "./matchRoom";
import { prisma } from "@/lib/prisma";

const ALLOWED_STAKES = [1, 2, 3, 5, 10, 25, 50, 100] as const;
export type StakeValue = (typeof ALLOWED_STAKES)[number];

type QueueUser = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  socketId: string;
  stake: StakeValue;
  joinedAt: number;
};

export class Matchmaker {
  private queue = new Map<string, QueueUser>();
  private rooms = new Map<string, MatchRoom>();
  private roomByUser = new Map<string, string>();

  constructor(private readonly io: Server) {}

  joinQueue(user: Omit<QueueUser, "joinedAt">): void {
    if (this.roomByUser.has(user.userId)) return;
    this.queue.set(user.userId, { ...user, joinedAt: Date.now() });
    void this.pairIfPossible();
  }

  leaveQueue(userId: string): void {
    this.queue.delete(userId);
  }

  findRoomByUser(userId: string): MatchRoom | null {
    const roomId = this.roomByUser.get(userId);
    if (!roomId) return null;
    return this.rooms.get(roomId) ?? null;
  }

  reconnectInRoom(userId: string, socketId: string): boolean {
    const room = this.findRoomByUser(userId);
    if (!room) return false;
    return room.handleReconnect(userId, socketId);
  }

  handleDisconnect(userId: string): void {
    this.queue.delete(userId);
    const room = this.findRoomByUser(userId);
    if (room) room.handleDisconnect(userId);
  }

  status(userId: string): { inQueue: boolean; eta: number | null } {
    if (!this.queue.has(userId)) return { inQueue: false, eta: null };
    return { inQueue: true, eta: Math.max(2, Math.floor(this.queue.size / 2)) };
  }

  private async pairIfPossible(): Promise<void> {
    if (this.queue.size < 2) return;
    const users = [...this.queue.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    const p1 = users[0];
    if (!p1) return;
    const p2 = users.find((u) => u.userId !== p1.userId && u.stake === p1.stake);
    if (!p2) return;

    this.queue.delete(p1.userId);
    this.queue.delete(p2.userId);

    const charged = await this.tryChargeStake([p1, p2], p1.stake);
    if (!charged.ok) {
      if (charged.insufficientUserId === p1.userId) this.io.to(p1.socketId).emit("session:error", { code: "INSUFFICIENT_COINS", message: "Not enough coins for selected stake" });
      if (charged.insufficientUserId === p2.userId) this.io.to(p2.socketId).emit("session:error", { code: "INSUFFICIENT_COINS", message: "Not enough coins for selected stake" });
      this.io.to(p1.socketId).emit("queue:status", { inQueue: false, eta: null });
      this.io.to(p2.socketId).emit("queue:status", { inQueue: false, eta: null });
      void this.pairIfPossible();
      return;
    }

    const room = new MatchRoom(this.io, [p1, p2], (roomId) => {
      const done = this.rooms.get(roomId);
      if (done) {
        done.state.players.forEach((p) => this.roomByUser.delete(p.userId));
      }
      this.rooms.delete(roomId);
    }, p1.stake, charged.potCoins);

    this.rooms.set(room.id, room);
    this.roomByUser.set(p1.userId, room.id);
    this.roomByUser.set(p2.userId, room.id);
    room.attachSockets();
    void this.pairIfPossible();
  }

  static sanitizeStake(input: number | undefined): StakeValue {
    const n = Number(input);
    if (ALLOWED_STAKES.includes(n as StakeValue)) return n as StakeValue;
    return 10;
  }

  private async tryChargeStake(
    players: [QueueUser, QueueUser],
    stake: StakeValue
  ): Promise<{ ok: true; potCoins: number } | { ok: false; insufficientUserId: string | null }> {
    const users = await prisma.user.findMany({
      where: { chatUserId: { in: players.map((p) => p.userId) } },
      include: { playerStats: true }
    });
    const byChat = new Map(users.map((u) => [u.chatUserId, u]));
    const first = byChat.get(players[0].userId);
    const second = byChat.get(players[1].userId);
    if (!first || !second || !first.playerStats || !second.playerStats) {
      return { ok: false, insufficientUserId: null };
    }
    if (first.playerStats.coins < stake) return { ok: false, insufficientUserId: players[0].userId };
    if (second.playerStats.coins < stake) return { ok: false, insufficientUserId: players[1].userId };

    await prisma.$transaction([
      prisma.playerStats.update({ where: { userId: first.id }, data: { coins: { decrement: stake } } }),
      prisma.playerStats.update({ where: { userId: second.id }, data: { coins: { decrement: stake } } })
    ]);

    return { ok: true, potCoins: stake * 2 };
  }
}
