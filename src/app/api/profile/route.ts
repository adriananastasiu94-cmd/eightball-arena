import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = getAuthUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    include: {
      playerStats: true,
      history: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { match: true }
      }
    }
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      stats: user.playerStats,
      recentMatches: user.history.map((h: { matchId: string; summary: string; createdAt: Date }) => ({ id: h.matchId, summary: h.summary, at: h.createdAt }))
    }
  });
}

export async function POST(request: NextRequest) {
  const auth = getAuthUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const avatarUrl = typeof body?.avatarUrl === "string" ? body.avatarUrl : null;
  if (!avatarUrl) return NextResponse.json({ error: "Invalid avatar url" }, { status: 400 });

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: { avatarUrl }
  });

  return NextResponse.json({ avatarUrl: user.avatarUrl });
}