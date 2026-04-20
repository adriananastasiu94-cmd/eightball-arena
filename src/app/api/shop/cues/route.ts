import { NextRequest, NextResponse } from "next/server";
import { chatMe } from "@/lib/chatAuth";
import { prisma } from "@/lib/prisma";
import { CUE_CATALOG, cueById } from "@/lib/shopCues";

type StatsShape = {
  id: string;
  userId: string;
  wins: number;
  losses: number;
  matchesPlayed: number;
  rating: number;
  level: number;
  xp: number;
  coins: number;
  cash: number;
  ownedCueIds: unknown;
  equippedCueId: string;
};

function parseOwnedCueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return ["cue_beginner"];
  const ids = value.filter((v): v is string => typeof v === "string" && v.length > 0);
  if (!ids.includes("cue_beginner")) ids.unshift("cue_beginner");
  return Array.from(new Set(ids));
}

async function getUserStats(request: NextRequest): Promise<{ stats: StatsShape; userDbId: string } | null> {
  const token = request.cookies.get("arena_chat_token")?.value;
  if (!token) return null;

  let chatUser;
  try {
    chatUser = await chatMe(token);
  } catch {
    return null;
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
    include: { playerStats: true }
  });

  if (!user.playerStats) return null;
  return { stats: user.playerStats as StatsShape, userDbId: user.id };
}

export async function GET(request: NextRequest) {
  const payload = await getUserStats(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ownedCueIds = parseOwnedCueIds(payload.stats.ownedCueIds);
  return NextResponse.json({
    catalog: CUE_CATALOG,
    wallet: {
      coins: payload.stats.coins,
      cash: payload.stats.cash,
      xp: payload.stats.xp,
      level: payload.stats.level
    },
    inventory: {
      ownedCueIds,
      equippedCueId: ownedCueIds.includes(payload.stats.equippedCueId) ? payload.stats.equippedCueId : "cue_beginner"
    }
  });
}

export async function POST(request: NextRequest) {
  const payload = await getUserStats(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const action = body?.action;
  const cueId = typeof body?.cueId === "string" ? body.cueId : "";
  const cue = cueById(cueId);
  if (!cue) return NextResponse.json({ error: "Cue not found" }, { status: 404 });

  const ownedCueIds = parseOwnedCueIds(payload.stats.ownedCueIds);

  if (action === "buy") {
    if (ownedCueIds.includes(cue.id)) {
      return NextResponse.json({ error: "Cue already owned" }, { status: 409 });
    }

    if (cue.currency === "coins" && payload.stats.coins < cue.price) {
      return NextResponse.json({ error: "Not enough coins" }, { status: 400 });
    }
    if (cue.currency === "cash" && payload.stats.cash < cue.price) {
      return NextResponse.json({ error: "Not enough cash" }, { status: 400 });
    }

    const nextOwned = [...ownedCueIds, cue.id];
    const updated = await prisma.playerStats.update({
      where: { userId: payload.userDbId },
      data: {
        ownedCueIds: nextOwned,
        equippedCueId: cue.id,
        coins: cue.currency === "coins" ? { decrement: cue.price } : undefined,
        cash: cue.currency === "cash" ? { decrement: cue.price } : undefined
      }
    });

    return NextResponse.json({
      ok: true,
      wallet: { coins: updated.coins, cash: updated.cash, xp: updated.xp, level: updated.level },
      inventory: { ownedCueIds: parseOwnedCueIds(updated.ownedCueIds), equippedCueId: updated.equippedCueId }
    });
  }

  if (action === "equip") {
    if (!ownedCueIds.includes(cue.id)) {
      return NextResponse.json({ error: "Cue not owned" }, { status: 403 });
    }
    const updated = await prisma.playerStats.update({
      where: { userId: payload.userDbId },
      data: { equippedCueId: cue.id }
    });
    return NextResponse.json({
      ok: true,
      wallet: { coins: updated.coins, cash: updated.cash, xp: updated.xp, level: updated.level },
      inventory: { ownedCueIds: parseOwnedCueIds(updated.ownedCueIds), equippedCueId: updated.equippedCueId }
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
