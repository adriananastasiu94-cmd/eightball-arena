import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Registration is managed by the chat app. Use your existing chat account." },
    { status: 410 }
  );
}