import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chatMe } from "@/lib/chatAuth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { grantFallbackCoins } from "@/lib/fallbackWallet";

const grantCoinsSchema = z.object({
  email: z.string().email(),
  amount: z.number().int().positive().max(1_000_000_000)
});

function getAdminAllowlist(): Set<string> {
  const raw = process.env.ADMIN_COIN_GRANT_EMAILS ?? "";
  const entries = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
  return new Set(entries);
}

function sanitizeUsername(value: string): string {
  const clean = value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24);
  return clean.length > 0 ? clean : "arena_player";
}

async function buildUniqueUsername(preferred: string): Promise<string> {
  const base = sanitizeUsername(preferred);
  for (let i = 0; i < 2000; i += 1) {
    const candidate = i === 0 ? base : `${base}_${i}`;
    const existing = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true }
    });
    if (!existing) return candidate;
  }
  return `arena_${Date.now()}`;
}

async function findUserByEmail(email: string) {
  return prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive"
      }
    },
    select: { id: true, email: true, username: true }
  });
}

async function ensureArenaUserByEmail(targetEmail: string) {
  const normalized = targetEmail.toLowerCase();
  let user = await findUserByEmail(normalized);
  if (user) return user;

  const username = await buildUniqueUsername(normalized.split("@")[0]);
  try {
    return await prisma.user.create({
      data: {
        email: normalized,
        username
      },
      select: { id: true, email: true, username: true }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      user = await findUserByEmail(normalized);
      if (user) return user;
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("arena_chat_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let actor;
  try {
    actor = await chatMe(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowlist = getAdminAllowlist();
  if (!allowlist.has(actor.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = grantCoinsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const targetEmail = parsed.data.email.trim();
  const amount = parsed.data.amount;

  try {
    const user = await ensureArenaUserByEmail(targetEmail);

    await prisma.playerStats.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id }
    });

    const updatedStats = await prisma.playerStats.update({
      where: { userId: user.id },
      data: { coins: { increment: amount } },
      select: { coins: true, cash: true }
    });

    return NextResponse.json({
      ok: true,
      grantedBy: actor.email,
      target: {
        email: user.email,
        username: user.username
      },
      amountGranted: amount,
      balances: {
        coins: updatedStats.coins,
        cash: updatedStats.cash
      }
    });
  } catch (error) {
    console.error("admin:grant-coins failed", error);
    try {
      const fallback = await grantFallbackCoins(targetEmail, amount);
      return NextResponse.json({
        ok: true,
        grantedBy: actor.email,
        target: {
          email: fallback.email,
          username: "fallback_wallet"
        },
        amountGranted: amount,
        balances: {
          coins: fallback.coins,
          cash: fallback.cash
        },
        warning: "wallet_fallback_mode"
      });
    } catch (fallbackError) {
      console.error("admin:grant-coins fallback failed", fallbackError);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        { error: "Unable to grant coins right now", code: error.code },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Unable to grant coins right now" }, { status: 500 });
  }
}
