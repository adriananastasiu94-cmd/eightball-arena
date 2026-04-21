import { prisma } from "@/lib/prisma";

const DEFAULT_COINS = 1000;
const DEFAULT_CASH = 200;

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export async function ensureFallbackWalletTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS arena_wallet_fallback (
      email TEXT PRIMARY KEY,
      coins BIGINT NOT NULL DEFAULT ${DEFAULT_COINS},
      cash BIGINT NOT NULL DEFAULT ${DEFAULT_CASH},
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function getFallbackWalletByEmail(email: string): Promise<{ email: string; coins: number; cash: number } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  await ensureFallbackWalletTable();
  const rows = await prisma.$queryRaw<Array<{ email: string; coins: unknown; cash: unknown }>>`
    SELECT email, coins, cash
    FROM arena_wallet_fallback
    WHERE email = ${normalized}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;
  return {
    email: row.email,
    coins: toNumber(row.coins, DEFAULT_COINS),
    cash: toNumber(row.cash, DEFAULT_CASH)
  };
}

export async function grantFallbackCoins(email: string, amount: number): Promise<{ email: string; coins: number; cash: number }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("INVALID_EMAIL");

  await ensureFallbackWalletTable();
  await prisma.$executeRaw`
    INSERT INTO arena_wallet_fallback (email)
    VALUES (${normalized})
    ON CONFLICT (email) DO NOTHING
  `;

  const rows = await prisma.$queryRaw<Array<{ email: string; coins: unknown; cash: unknown }>>`
    UPDATE arena_wallet_fallback
    SET coins = coins + ${amount}, updated_at = NOW()
    WHERE email = ${normalized}
    RETURNING email, coins, cash
  `;

  const row = rows[0];
  if (!row) throw new Error("FALLBACK_UPDATE_FAILED");
  return {
    email: row.email,
    coins: toNumber(row.coins, DEFAULT_COINS + amount),
    cash: toNumber(row.cash, DEFAULT_CASH)
  };
}
