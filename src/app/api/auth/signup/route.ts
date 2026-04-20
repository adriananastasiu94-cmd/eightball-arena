import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/jwt";
import { signupSchema } from "@/lib/validators";
import { enforceRateLimit } from "@/lib/httpRateLimit";

export async function POST(request: NextRequest) {
  if (!enforceRateLimit(request, "auth_signup", 8, 60_000)) {
    return NextResponse.json({ error: "Too many signup attempts" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { email, username, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        playerStats: { create: {} }
      }
    });

    const token = signToken({ userId: user.id, username: user.username });
    const response = NextResponse.json({ user: { id: user.id, username: user.username, email: user.email } });
    response.cookies.set("arena_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Email or username already used" }, { status: 409 });
  }
}
