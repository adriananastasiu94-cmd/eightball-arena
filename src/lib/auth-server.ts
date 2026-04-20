import { NextRequest } from "next/server";
import { verifyToken } from "./jwt";

export function getAuthUser(req: NextRequest) {
  const token = req.cookies.get("arena_token")?.value;
  if (!token) return null;
  return verifyToken(token);
}