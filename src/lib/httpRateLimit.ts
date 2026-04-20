import { NextRequest } from "next/server";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function enforceRateLimit(req: NextRequest, key: string, limit: number, windowMs: number): boolean {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const now = Date.now();
  const id = `${key}:${ip}`;

  const current = buckets.get(id);
  if (!current || now > current.resetAt) {
    buckets.set(id, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}