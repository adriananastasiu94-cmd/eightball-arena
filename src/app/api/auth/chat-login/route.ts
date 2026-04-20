import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chatLogin } from "@/lib/chatAuth";
import { enforceRateLimit } from "@/lib/httpRateLimit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72)
});

export async function POST(request: NextRequest) {
  if (!enforceRateLimit(request, "chat_login", 18, 60_000)) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  try {
    const { token, user } = await chatLogin(parsed.data.email, parsed.data.password);
    const response = NextResponse.json({
      user: { id: user.id, username: user.username, email: user.email, avatarUrl: user.avatarUrl ?? null }
    });
    response.cookies.set("arena_chat_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7
    });
    return response;
  } catch (error) {
    if ((error as Error).message === "CHAT_UNREACHABLE") {
      return NextResponse.json({ error: "Chat service unavailable. Please try again shortly." }, { status: 502 });
    }
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
}
