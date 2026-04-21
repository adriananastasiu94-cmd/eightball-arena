import { NextRequest, NextResponse } from "next/server";
import { chatMe } from "@/lib/chatAuth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

function parseOwnedCueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return ["cue_beginner"];
  const ids = value.filter((v): v is string => typeof v === "string" && v.length > 0);
  if (!ids.includes("cue_beginner")) ids.unshift("cue_beginner");
  return Array.from(new Set(ids));
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

  const includePayload = {
    playerStats: true,
    history: {
      orderBy: { createdAt: "desc" as const },
      take: 10,
      include: { match: true }
    }
  };

  let user;
  try {
    const byChatId = await prisma.user.findUnique({
      where: { chatUserId: chatUser.id },
      include: includePayload
    });

    if (byChatId) {
      user = await prisma.user.update({
        where: { id: byChatId.id },
        data: {
          email: chatUser.email,
          username: chatUser.username,
          avatarUrl: chatUser.avatarUrl ?? null
        },
        include: includePayload
      });
    } else {
      const byEmail = await prisma.user.findUnique({
        where: { email: chatUser.email },
        include: includePayload
      });

      if (byEmail) {
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: {
            chatUserId: chatUser.id,
            username: chatUser.username,
            avatarUrl: chatUser.avatarUrl ?? null
          },
          include: includePayload
        });
      } else {
        user = await prisma.user.create({
          data: {
            chatUserId: chatUser.id,
            email: chatUser.email,
            username: chatUser.username,
            avatarUrl: chatUser.avatarUrl ?? null,
            playerStats: { create: {} }
          },
          include: includePayload
        });
      }
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const fallback = await prisma.user.findFirst({
        where: {
          OR: [{ chatUserId: chatUser.id }, { email: chatUser.email }, { username: chatUser.username }]
        },
        include: includePayload
      });

      if (fallback) {
        user = await prisma.user.update({
          where: { id: fallback.id },
          data: {
            chatUserId: chatUser.id,
            email: chatUser.email,
            username: chatUser.username,
            avatarUrl: chatUser.avatarUrl ?? null
          },
          include: includePayload
        });
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

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
      recentMatches: user.history.map((h: { matchId: string; summary: string; createdAt: Date }) => ({ id: h.matchId, summary: h.summary, at: h.createdAt }))
    }
  });
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

  const user = await prisma.user.upsert({
    where: { chatUserId: chatUser.id },
    update: { avatarUrl, email: chatUser.email, username: chatUser.username },
    create: {
      chatUserId: chatUser.id,
      email: chatUser.email,
      username: chatUser.username,
      avatarUrl,
      playerStats: { create: {} }
    }
  });

  return NextResponse.json({ avatarUrl: user.avatarUrl });
}
