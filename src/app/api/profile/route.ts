import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { chatMe } from "@/lib/chatAuth";
import { prisma } from "@/lib/prisma";
import { getFallbackWalletByEmail } from "@/lib/fallbackWallet";
import { ensureFallbackInventoryByEmail } from "@/lib/fallbackInventory";
import { DEFAULT_CUE_ID } from "@/lib/shopCues";

type ArenaProfileResponseUser = {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string | null;
  stats: {
    wins: number;
    losses: number;
    matchesPlayed: number;
    winStreak: number;
    rating: number;
    level: number;
    xp: number;
    coins: number;
    cash: number;
    ownedCueIds: string[];
    equippedCueId: string;
  };
  recentMatches: Array<{ id: string; summary: string; at: Date }>;
};

function parseOwnedCueIds(value: unknown): string[] {
  const normalized = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : typeof value === "string"
      ? value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
  if (!normalized.includes(DEFAULT_CUE_ID)) normalized.unshift(DEFAULT_CUE_ID);
  return Array.from(new Set(normalized));
}

function sanitizeUsername(value: string): string {
  const clean = value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24);
  return clean.length > 0 ? clean : "arena_player";
}

async function buildUniqueUsername(preferred: string, excludeUserId?: string): Promise<string> {
  const base = sanitizeUsername(preferred);
  for (let i = 0; i < 2000; i += 1) {
    const candidate = i === 0 ? base : `${base}_${i}`;
    const owner = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true }
    });
    if (!owner || owner.id === excludeUserId) return candidate;
  }
  return `arena_${Date.now()}`;
}

type ChatProfile = {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string | null;
};

function fallbackProfileFromChat(chatUser: ChatProfile): ArenaProfileResponseUser {
  return {
    id: chatUser.id,
    username: chatUser.username,
    email: chatUser.email,
    avatarUrl: chatUser.avatarUrl ?? null,
    stats: {
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
      winStreak: 0,
      rating: 1000,
      level: 1,
      xp: 0,
      coins: 1000,
      cash: 200,
      ownedCueIds: [DEFAULT_CUE_ID],
      equippedCueId: DEFAULT_CUE_ID
    },
    recentMatches: []
  };
}

async function getWinStreak(userDbId: string): Promise<number> {
  const rows = await prisma.matchParticipant.findMany({
    where: { userId: userDbId },
    select: {
      isWinner: true,
      match: { select: { startedAt: true } }
    },
    orderBy: { match: { startedAt: "desc" } },
    take: 60
  });

  let streak = 0;
  for (const row of rows) {
    if (!row.isWinner) break;
    streak += 1;
  }
  return streak;
}

function withFallbackData(
  user: ArenaProfileResponseUser,
  wallet?: { coins: number; cash: number } | null,
  inventory?: { ownedCueIds: string[]; equippedCueId: string } | null
): ArenaProfileResponseUser {
  return {
    ...user,
    stats: {
      ...user.stats,
      coins: wallet?.coins ?? user.stats.coins,
      cash: wallet?.cash ?? user.stats.cash,
      ownedCueIds: inventory?.ownedCueIds ?? user.stats.ownedCueIds,
      equippedCueId: inventory?.equippedCueId ?? user.stats.equippedCueId
    }
  };
}

async function findByEmailInsensitive(email: string) {
  return prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive"
      }
    },
    select: { id: true }
  });
}

async function resolveArenaUser(chatUser: ChatProfile) {
  let user = await prisma.user.findUnique({
    where: { chatUserId: chatUser.id },
    select: { id: true, chatUserId: true, email: true, username: true }
  });

  if (!user) {
    const byEmail = await findByEmailInsensitive(chatUser.email);
    if (byEmail) {
      user = await prisma.user.findUnique({
        where: { id: byEmail.id },
        select: { id: true, chatUserId: true, email: true, username: true }
      });
    }
  }

  if (!user) {
    const username = await buildUniqueUsername(chatUser.username || chatUser.email.split("@")[0]);
    const email = chatUser.email.toLowerCase();
    try {
      user = await prisma.user.create({
        data: {
          chatUserId: chatUser.id,
          email,
          username,
          avatarUrl: chatUser.avatarUrl ?? null
        },
        select: { id: true, chatUserId: true, email: true, username: true }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        user =
          (await prisma.user.findUnique({
            where: { chatUserId: chatUser.id },
            select: { id: true, chatUserId: true, email: true, username: true }
          })) ??
          (await prisma.user.findFirst({
            where: { email: { equals: email, mode: "insensitive" } },
            select: { id: true, chatUserId: true, email: true, username: true }
          }));
      } else {
        throw error;
      }
    }
  }

  if (!user) {
    throw new Error("ARENA_USER_RESOLVE_FAILED");
  }

  const updateData: {
    chatUserId?: string;
    email?: string;
    username?: string;
    avatarUrl: string | null;
  } = {
    avatarUrl: chatUser.avatarUrl ?? null
  };

  if (!user.chatUserId) updateData.chatUserId = chatUser.id;

  const emailOwner = await findByEmailInsensitive(chatUser.email);
  if (!emailOwner || emailOwner.id === user.id) {
    updateData.email = chatUser.email.toLowerCase();
  }

  const usernameOwner = await prisma.user.findUnique({
    where: { username: chatUser.username },
    select: { id: true }
  });
  if (!usernameOwner || usernameOwner.id === user.id) {
    updateData.username = chatUser.username;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: updateData
  });

  await prisma.playerStats.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id }
  });

  return prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: {
      playerStats: true,
      history: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { match: true }
      }
    }
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
    const winStreak = await getWinStreak(user.id).catch(() => 0);
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
              winStreak,
              ownedCueIds: parseOwnedCueIds(user.playerStats.ownedCueIds),
              equippedCueId: user.playerStats.equippedCueId || DEFAULT_CUE_ID
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
    console.error("profile:get failed", error);
    const wallet = await getFallbackWalletByEmail(chatUser.email).catch(() => null);
    const inventory = await ensureFallbackInventoryByEmail(chatUser.email).catch(() => null);
    const fallbackUser = withFallbackData(fallbackProfileFromChat(chatUser), wallet, inventory);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({
        user: fallbackUser,
        warning: "profile_sync_degraded",
        code: error.code
      });
    }
    return NextResponse.json({
      user: fallbackUser,
      warning: "profile_sync_degraded"
    });
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
    console.error("profile:post failed", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        { error: "Unable to update avatar right now", code: error.code },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Unable to update avatar right now" }, { status: 500 });
  }
}
