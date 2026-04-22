import { NextRequest, NextResponse } from "next/server";
import { chatMe } from "@/lib/chatAuth";
import { prisma } from "@/lib/prisma";
import { CUE_CATALOG, cueById, DEFAULT_CUE_ID } from "@/lib/shopCues";
import {
  debitFallbackCash,
  debitFallbackCoins,
  getFallbackWalletByEmail,
  grantFallbackCash,
  grantFallbackCoins
} from "@/lib/fallbackWallet";
import {
  addFallbackOwnedCue,
  ensureFallbackInventoryByEmail,
  equipFallbackCue
} from "@/lib/fallbackInventory";
import { Prisma } from "@prisma/client";

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

type ChatIdentity = {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string | null;
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

async function buildUniqueUsername(preferred: string): Promise<string> {
  const base = sanitizeUsername(preferred);
  for (let i = 0; i < 2000; i += 1) {
    const candidate = i === 0 ? base : `${base}_${i}`;
    const owner = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true }
    });
    if (!owner) return candidate;
  }
  return `arena_${Date.now()}`;
}

async function findUserByEmailInsensitive(email: string) {
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, chatUserId: true, email: true, username: true, avatarUrl: true }
  });
}

async function authChatUser(request: NextRequest): Promise<ChatIdentity | null> {
  const token = request.cookies.get("arena_chat_token")?.value;
  if (!token) return null;
  try {
    return await chatMe(token);
  } catch {
    return null;
  }
}

async function resolveArenaStats(chatUser: ChatIdentity): Promise<{ stats: StatsShape; userDbId: string }> {
  let user = await prisma.user.findUnique({
    where: { chatUserId: chatUser.id },
    select: { id: true, chatUserId: true, email: true, username: true }
  });

  if (!user) {
    user = await findUserByEmailInsensitive(chatUser.email);
  }

  if (!user) {
    const username = await buildUniqueUsername(chatUser.username || chatUser.email.split("@")[0]);
    const created = await prisma.user.create({
      data: {
        chatUserId: chatUser.id,
        email: chatUser.email.toLowerCase(),
        username,
        avatarUrl: chatUser.avatarUrl ?? null
      },
      select: { id: true, chatUserId: true, email: true, username: true }
    });
    user = created;
  } else {
    const updateData: {
      chatUserId?: string;
      email?: string;
      username?: string;
      avatarUrl: string | null;
    } = {
      avatarUrl: chatUser.avatarUrl ?? null
    };

    if (!user.chatUserId) updateData.chatUserId = chatUser.id;

    const emailOwner = await findUserByEmailInsensitive(chatUser.email);
    if (!emailOwner || emailOwner.id === user.id) updateData.email = chatUser.email.toLowerCase();

    const usernameOwner = await prisma.user.findUnique({
      where: { username: chatUser.username },
      select: { id: true }
    });
    if (!usernameOwner || usernameOwner.id === user.id) updateData.username = chatUser.username;

    await prisma.user.update({
      where: { id: user.id },
      data: updateData
    });
  }

  await prisma.playerStats.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id }
  });

  const stats = await prisma.playerStats.findUnique({
    where: { userId: user.id }
  });
  if (!stats) throw new Error("MISSING_PLAYER_STATS");
  return { stats: stats as StatsShape, userDbId: user.id };
}

async function fallbackShopState(email: string) {
  const wallet = (await getFallbackWalletByEmail(email)) ?? { email: email.toLowerCase(), coins: 1000, cash: 200 };
  const inventory = await ensureFallbackInventoryByEmail(email);
  return {
    wallet: {
      coins: wallet.coins,
      cash: wallet.cash,
      xp: 0,
      level: 1
    },
    inventory: {
      ownedCueIds: inventory.ownedCueIds,
      equippedCueId: inventory.equippedCueId
    }
  };
}

export async function GET(request: NextRequest) {
  const chatUser = await authChatUser(request);
  if (!chatUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const payload = await resolveArenaStats(chatUser);
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
        equippedCueId: ownedCueIds.includes(payload.stats.equippedCueId)
          ? payload.stats.equippedCueId
          : DEFAULT_CUE_ID
      }
    });
  } catch (error) {
    console.error("shop:get failed", error);
    const fallback = await fallbackShopState(chatUser.email);
    return NextResponse.json({
      catalog: CUE_CATALOG,
      ...fallback,
      warning: "shop_fallback_mode"
    });
  }
}

export async function POST(request: NextRequest) {
  const chatUser = await authChatUser(request);
  if (!chatUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const action = body?.action;
  const cueId = typeof body?.cueId === "string" ? body.cueId : "";
  const cue = cueById(cueId);
  if (!cue) return NextResponse.json({ error: "Cue not found" }, { status: 404 });

  try {
    const payload = await resolveArenaStats(chatUser);
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
  } catch (error) {
    console.error("shop:post failed", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("shop:post prisma code", error.code);
    }

    const fallback = await fallbackShopState(chatUser.email);
    if (action === "buy") {
      if (fallback.inventory.ownedCueIds.includes(cue.id)) {
        return NextResponse.json({ error: "Cue already owned" }, { status: 409 });
      }

      if (cue.currency === "coins") {
        const debit = await debitFallbackCoins(chatUser.email, cue.price);
        if (!debit.ok) return NextResponse.json({ error: "Not enough coins" }, { status: 400 });
      } else {
        const debit = await debitFallbackCash(chatUser.email, cue.price);
        if (!debit.ok) return NextResponse.json({ error: "Not enough cash" }, { status: 400 });
      }

      try {
        const inventory = await addFallbackOwnedCue(chatUser.email, cue.id);
        const wallet = await getFallbackWalletByEmail(chatUser.email);
        return NextResponse.json({
          ok: true,
          wallet: {
            coins: wallet?.coins ?? 1000,
            cash: wallet?.cash ?? 200,
            xp: 0,
            level: 1
          },
          inventory,
          warning: "shop_fallback_mode"
        });
      } catch (fallbackError) {
        // Refund if inventory write failed.
        if (cue.currency === "coins") {
          await grantFallbackCoins(chatUser.email, cue.price).catch(() => undefined);
        } else {
          await grantFallbackCash(chatUser.email, cue.price).catch(() => undefined);
        }
        console.error("shop:buy fallback inventory failed", fallbackError);
        return NextResponse.json({ error: "Unable to buy cue right now" }, { status: 500 });
      }
    }

    if (action === "equip") {
      const inventory = await equipFallbackCue(chatUser.email, cue.id);
      if (!inventory) return NextResponse.json({ error: "Cue not owned" }, { status: 403 });
      const wallet = await getFallbackWalletByEmail(chatUser.email);
      return NextResponse.json({
        ok: true,
        wallet: {
          coins: wallet?.coins ?? 1000,
          cash: wallet?.cash ?? 200,
          xp: 0,
          level: 1
        },
        inventory,
        warning: "shop_fallback_mode"
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
}
