import { NextRequest, NextResponse } from "next/server";
import { chatMe } from "@/lib/chatAuth";
import { prisma } from "@/lib/prisma";

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

  const user = await prisma.user.upsert({
    where: { chatUserId: chatUser.id },
    update: {
      email: chatUser.email,
      username: chatUser.username,
      avatarUrl: chatUser.avatarUrl ?? null
    },
    create: {
      chatUserId: chatUser.id,
      email: chatUser.email,
      username: chatUser.username,
      avatarUrl: chatUser.avatarUrl ?? null,
      playerStats: { create: {} }
    },
    include: {
      playerStats: true,
      history: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { match: true }
      }
    }
  });

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
