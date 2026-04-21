import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "eightball-arena",
    version: "txless-profile-grant-v1",
    nodeEnv: process.env.NODE_ENV ?? null,
    renderService: process.env.RENDER_SERVICE_NAME ?? null
  });
}
