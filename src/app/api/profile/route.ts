import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { chatMe } from "@/lib/chatAuth";
import { prisma } from "@/lib/prisma";

function parseOwnedCueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return ["cue_beginner"];
  const ids = value.filter((v): v is string => typeof v === "string" && v.length > 0);
  if (!ids.includes("cue_beginner")) ids.unshift("cue_beginner");
  return Array.from(new Set(ids));
}

function sanitizeUsername(value: string): string {
  const clean = value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24);
  return clean.length > 0 ? clean : "arena_player";
}

async function buildUniqueUsername(
  tx: Omit<
    PrismaClient,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
  >,
  preferred: string,
  excludeUserId?: string
): Promise<string> {
  const base = sanitizeUsername(preferred);
  for (let i = 0; i < 2000; i += 1) {
    const candidate = i === 0 ? base : `${base}_${i}`;
    const owner = await tx.user.findUnique({
      where: { username: candidate },
      select: { id: true }
    });
    if (!owner || owner.id === excludeUserId) return candidate;
  }
  return `arena_${Date.now()}`;
}

async function resolveArenaUser(chatUser: {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const byChatId = await tx.user.findUnique({
      where: { chatUserId: chatUser.id },
      select: { id: true, username: true }
    });
    const byEmail = await tx.user.findUnique({
      where: { email: chatUser.email },
      select: { id: true, username: true }
    });

    let targetId = byChatId?.id ?? byEmail?.id;
    if (!targetId) {
      const username = await buildUniqueUsername(tx, chatUser.username || chatUser.email.split("@")[0]);
      const created = await tx.user.create({
        data: {
          chatUserId: chatUser.id,
          email: chatUser.email,
          username,
          avatarUrl: chatUser.avatarUrl ?? null
        },
        select: { id: true }
      });
      targetId = created.id;
    } else {
      const data: {
        chatUserId?: string;
        email?: string;
        username?: string;
        avatarUrl: string | null;
      } = {
        avatarUrl: chatUser.avatarUrl ?? null
      };

      if (!byChatId) data.chatUserId = chatUser.id;

      const emailOwner = await tx.user.findUnique({
        where: { email: chatUser.email },
        select: { id: true }
      });
      if (!emailOwner || emailOwner.id === targetId) data.email = chatUser.email;

      const usernameOwner = await tx.user.findUnique({
        where: { username: chatUser.username },
        select: { id: true }
      });
      if (!usernameOwner || usernameOwner.id === targetId) {
        data.username = chatUser.username;
      }

      await tx.user.update({
        where: { id: targetId },
        data
      });
    }

    await tx.playerStats.upsert({
      where: { userId: targetId },
      update: {},
      create: { userId: targetId }
    });

    return tx.user.findUniqueOrThrow({
      where: { id: targetId },
      include: {
        playerStats: true,
        history: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { match: true }
        }
      }
    });
  });
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("arena_chat_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let chatUser;
  try {
    chatUser = await chatMe(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await resolveArenaUser(chatUser);
    return NextResponse.json({
      user: {
        id: user.chatUserId ?? user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        stats: user.playerStats
          ? {
              ...user.playerStats,
              xp: user.playerStats.xp ?? 0,
              coins: user.playerStats.coins ?? 1000,
              cash: user.playerStats.cash ?? 200,
              ownedCueIds: parseOwnedCueIds(user.playerStats.ownedCueIds),
              equippedCueId: user.playerStats.equippedCueId || "cue_beginner"
            }
          : null,
        recentMatches: user.history.map((h: { matchId: string; summary: string; createdAt: Date }) => ({
          id: h.matchId,
          summary: h.summary,
          at: h.createdAt
        }))
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        { error: "Unable to load profile right now", code: error.code },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Unable to load profile right now" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("arena_chat_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let chatUser;
  try {
    chatUser = await chatMe(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const avatarUrl = typeof body?.avatarUrl === "string" ? body.avatarUrl : null;
  if (!avatarUrl) return NextResponse.json({ error: "Invalid avatar url" }, { status: 400 });

  try {
    const user = await resolveArenaUser({
      ...chatUser,
      avatarUrl
    });
    return NextResponse.json({ avatarUrl: user.avatarUrl });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        { error: "Unable to update avatar right now", code: error.code },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Unable to update avatar right now" }, { status: 500 });
  }
}
