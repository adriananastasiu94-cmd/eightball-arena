import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/jwt";
import { loginSchema } from "@/lib/validators";
import { enforceRateLimit } from "@/lib/httpRateLimit";

export async function POST(request: NextRequest) {
  if (!enforceRateLimit(request, "auth_login", 14, 60_000)) {
    return NextResponse.json({ error: "Too many login attempts" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email }, include: { playerStats: true } });
  if (!user) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  const token = signToken({ userId: user.id, username: user.username });
  const response = NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      stats: user.playerStats
    }
  });
  response.cookies.set("arena_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  return response;
}
