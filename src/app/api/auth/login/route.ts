import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Use /api/auth/chat-login to sign in with your chat account." },
    { status: 410 }
  );
}