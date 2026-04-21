import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chatMe } from "@/lib/chatAuth";
import { prisma } from "@/lib/prisma";
import { Prisma, PrismaClient } from "@prisma/client";

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

async function buildUniqueUsername(
  tx: Omit<
    PrismaClient,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
  >,
  preferred: string
): Promise<string> {
  const base = sanitizeUsername(preferred);
  for (let i = 0; i < 2000; i += 1) {
    const candidate = i === 0 ? base : `${base}_${i}`;
    const existing = await tx.user.findUnique({
      where: { username: candidate },
      select: { id: true }
    });
    if (!existing) return candidate;
  }
  return `arena_${Date.now()}`;
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
    const result = await prisma.$transaction(async (tx) => {
      let user = await tx.user.findFirst({
        where: {
          email: {
            equals: targetEmail,
            mode: "insensitive"
          }
        },
        select: { id: true, email: true, username: true }
      });
      if (!user) {
        const username = await buildUniqueUsername(tx, targetEmail.split("@")[0]);
        user = await tx.user.create({
          data: {
            email: targetEmail.toLowerCase(),
            username
          },
          select: { id: true, email: true, username: true }
        });
      }

      await tx.playerStats.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id }
      });

      const updatedStats = await tx.playerStats.update({
        where: { userId: user.id },
        data: { coins: { increment: amount } },
        select: { coins: true, cash: true }
      });

      return {
        user,
        coins: updatedStats.coins,
        cash: updatedStats.cash
      };
    });

    return NextResponse.json({
      ok: true,
      grantedBy: actor.email,
      target: {
        email: result.user.email,
        username: result.user.username
      },
      amountGranted: amount,
      balances: {
        coins: result.coins,
        cash: result.cash
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        { error: "Unable to grant coins right now", code: error.code },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Unable to grant coins right now" }, { status: 500 });
  }
}
