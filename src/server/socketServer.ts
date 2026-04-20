import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { verifyToken } from "@/lib/jwt";
import { shotSchema } from "@/lib/validators";
import { Matchmaker } from "./matchmaking";
import { MemoryRateLimiter } from "./rateLimit";
import { prisma } from "@/lib/prisma";

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    path: process.env.NEXT_PUBLIC_SOCKET_PATH || "/socket.io",
    cors: {
      origin: true,
      credentials: true
    }
  });

  const matchmaker = new Matchmaker(io);
  const shotLimiter = new MemoryRateLimiter(12, 3000);

  io.use(async (socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers.cookie
        ?.split(";")
        .map((x: string) => x.trim())
        .find((x: string) => x.startsWith("arena_token="))
        ?.split("=")[1];

    if (!token) return next(new Error("UNAUTHORIZED"));
    const auth = verifyToken(token);
    if (!auth) return next(new Error("UNAUTHORIZED"));

    const user = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user) return next(new Error("UNAUTHORIZED"));

    socket.data.user = {
      userId: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl
    };
    next();
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as { userId: string; username: string; avatarUrl: string | null };
    matchmaker.reconnectInRoom(user.userId, socket.id);

    socket.emit("queue:status", matchmaker.status(user.userId));

    socket.on("queue:join", () => {
      matchmaker.joinQueue({ ...user, socketId: socket.id });
      socket.emit("queue:status", matchmaker.status(user.userId));
    });

    socket.on("queue:leave", () => {
      matchmaker.leaveQueue(user.userId);
      socket.emit("queue:status", matchmaker.status(user.userId));
    });

    socket.on("match:shot", (payload) => {
      if (!shotLimiter.hit(`shot:${user.userId}`)) {
        socket.emit("match:shot-rejected", { reason: "Too many shots" });
        return;
      }

      const parsed = shotSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit("match:shot-rejected", { reason: "Malformed shot" });
        return;
      }

      const room = matchmaker.findRoomByUser(user.userId);
      if (!room) return;
      room.handleShot(user.userId, parsed.data);
    });

    socket.on("match:ball-in-hand", ({ x, y }) => {
      const room = matchmaker.findRoomByUser(user.userId);
      if (!room) return;
      room.handleBallInHand(user.userId, x, y);
    });

    socket.on("match:rematch", () => {
      const room = matchmaker.findRoomByUser(user.userId);
      if (!room) return;
      room.handleRematch(user.userId);
    });

    socket.on("disconnect", () => {
      matchmaker.handleDisconnect(user.userId);
    });
  });

  return io;
}