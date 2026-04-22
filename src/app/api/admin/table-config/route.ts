import { NextRequest, NextResponse } from "next/server";
import { chatMe } from "@/lib/chatAuth";
import { getArenaTableConfig, saveArenaTableConfig } from "@/lib/tableConfigStore";

function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function canEdit(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const editorAllow = parseAllowlist(process.env.ADMIN_TABLE_EDITOR_EMAILS);
  if (editorAllow.size > 0) return editorAllow.has(normalized);
  const fallback = parseAllowlist(process.env.ADMIN_COIN_GRANT_EMAILS);
  return fallback.has(normalized);
}

async function requireChatUser(request: NextRequest): Promise<{ id: string; email: string } | null> {
  const token = request.cookies.get("arena_chat_token")?.value;
  if (!token) return null;
  try {
    const user = await chatMe(token);
    return { id: user.id, email: user.email };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const user = await requireChatUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const config = await getArenaTableConfig();
  return NextResponse.json({ config, canEdit: canEdit(user.email) });
}

export async function POST(request: NextRequest) {
  const user = await requireChatUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const config = await saveArenaTableConfig(body);
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    console.error("table-config:save failed", error);
    return NextResponse.json({ error: "Unable to save table config" }, { status: 500 });
  }
}

