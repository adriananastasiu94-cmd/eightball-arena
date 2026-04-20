import { z } from "zod";

const chatUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string(),
  avatarUrl: z.string().optional().nullable()
});

export type ChatUser = z.infer<typeof chatUserSchema>;

function chatBaseUrl(): string {
  return process.env.CHAT_API_URL || "https://chordchat-api.onrender.com";
}

export async function chatLogin(email: string, password: string): Promise<{ token: string; user: ChatUser }> {
  const base = chatBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
  } catch {
    throw new Error("CHAT_UNREACHABLE");
  }

  if (!res.ok) throw new Error("Invalid chat credentials");
  const json = await res.json();

  const token = typeof json?.token === "string" ? json.token : "";
  const parsed = chatUserSchema.safeParse(json?.user);
  if (!token || !parsed.success) throw new Error("Unexpected chat auth response");

  return { token, user: parsed.data };
}

export async function chatMe(token: string): Promise<ChatUser> {
  const base = chatBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${base}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch {
    throw new Error("CHAT_UNREACHABLE");
  }

  if (!res.ok) throw new Error("Chat session is invalid");
  const json = await res.json();
  const parsed = chatUserSchema.safeParse(json?.user);
  if (!parsed.success) throw new Error("Unexpected chat me response");
  return parsed.data;
}
