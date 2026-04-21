import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chatMe } from "@/lib/chatAuth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

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
      const user = await tx.user.findFirst({
        where: {
          email: {
            equals: targetEmail,
            mode: "insensitive"
          }
        },
        select: { id: true, email: true, username: true }
      });
      if (!user) return null;

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

    if (!result) return NextResponse.json({ error: "User not found" }, { status: 404 });

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
        { error: `Unable to grant coins right now (${error.code})` },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Unable to grant coins right now" }, { status: 500 });
  }
}
