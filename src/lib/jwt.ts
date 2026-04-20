import jwt from "jsonwebtoken";

export type JwtUser = {
  userId: string;
  username: string;
};

export function signToken(payload: JwtUser): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is missing");
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtUser | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    return jwt.verify(token, secret) as JwtUser;
  } catch {
    return null;
  }
}