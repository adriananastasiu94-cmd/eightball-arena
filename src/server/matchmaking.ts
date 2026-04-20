import { Server } from "socket.io";
import { MatchRoom } from "./matchRoom";

type QueueUser = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  socketId: string;
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
    this.pairIfPossible();
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

  private pairIfPossible(): void {
    if (this.queue.size < 2) return;
    const users = [...this.queue.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    const p1 = users[0];
    const p2 = users[1];
    if (!p1 || !p2) return;

    this.queue.delete(p1.userId);
    this.queue.delete(p2.userId);

    const room = new MatchRoom(this.io, [p1, p2], (roomId) => {
      const done = this.rooms.get(roomId);
      if (done) {
        done.state.players.forEach((p) => this.roomByUser.delete(p.userId));
      }
      this.rooms.delete(roomId);
    });

    this.rooms.set(room.id, room);
    this.roomByUser.set(p1.userId, room.id);
    this.roomByUser.set(p2.userId, room.id);
    room.attachSockets();
  }
}