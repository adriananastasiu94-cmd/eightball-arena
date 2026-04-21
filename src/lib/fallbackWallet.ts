import { prisma } from "@/lib/prisma";

const DEFAULT_COINS = 1000;
const DEFAULT_CASH = 200;

type Wallet = { coins: number; cash: number };

declare global {
  var arenaWalletFallbackMemory: Map<string, Wallet> | undefined;
}

const memoryWallet = global.arenaWalletFallbackMemory ?? new Map<string, Wallet>();
if (!global.arenaWalletFallbackMemory) {
  global.arenaWalletFallbackMemory = memoryWallet;
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function readMemoryWallet(email: string): { email: string; coins: number; cash: number } {
  const normalized = normalizeEmail(email);
  const existing = memoryWallet.get(normalized);
  const wallet = existing ?? { coins: DEFAULT_COINS, cash: DEFAULT_CASH };
  if (!existing) memoryWallet.set(normalized, wallet);
  return { email: normalized, coins: wallet.coins, cash: wallet.cash };
}

function writeMemoryWallet(email: string, wallet: Wallet): { email: string; coins: number; cash: number } {
  const normalized = normalizeEmail(email);
  memoryWallet.set(normalized, wallet);
  return { email: normalized, coins: wallet.coins, cash: wallet.cash };
}

export async function ensureFallbackWalletTable(): Promise<boolean> {
  try {
    await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS arena_wallet_fallback (
      email TEXT PRIMARY KEY,
      coins BIGINT NOT NULL DEFAULT ${DEFAULT_COINS},
      cash BIGINT NOT NULL DEFAULT ${DEFAULT_CASH},
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
    return true;
  } catch {
    return false;
  }
}

export async function getFallbackWalletByEmail(email: string): Promise<{ email: string; coins: number; cash: number } | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const tableReady = await ensureFallbackWalletTable();
  if (!tableReady) return readMemoryWallet(normalized);

  try {
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
  } catch {
    return readMemoryWallet(normalized);
  }
}

export async function grantFallbackCoins(email: string, amount: number): Promise<{ email: string; coins: number; cash: number }> {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error("INVALID_EMAIL");

  const tableReady = await ensureFallbackWalletTable();
  if (!tableReady) {
    const wallet = readMemoryWallet(normalized);
    return writeMemoryWallet(normalized, { coins: wallet.coins + amount, cash: wallet.cash });
  }

  try {
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
  } catch {
    const wallet = readMemoryWallet(normalized);
    return writeMemoryWallet(normalized, { coins: wallet.coins + amount, cash: wallet.cash });
  }
}

export async function debitFallbackCoins(
  email: string,
  amount: number
): Promise<{ ok: true; wallet: { email: string; coins: number; cash: number } } | { ok: false }> {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false };

  const tableReady = await ensureFallbackWalletTable();
  if (!tableReady) {
    const wallet = readMemoryWallet(normalized);
    if (wallet.coins < amount) return { ok: false };
    const next = writeMemoryWallet(normalized, { coins: wallet.coins - amount, cash: wallet.cash });
    return { ok: true, wallet: next };
  }

  try {
    await prisma.$executeRaw`
      INSERT INTO arena_wallet_fallback (email)
      VALUES (${normalized})
      ON CONFLICT (email) DO NOTHING
    `;

    const rows = await prisma.$queryRaw<Array<{ email: string; coins: unknown; cash: unknown }>>`
      UPDATE arena_wallet_fallback
      SET coins = coins - ${amount}, updated_at = NOW()
      WHERE email = ${normalized}
        AND coins >= ${amount}
      RETURNING email, coins, cash
    `;
    const row = rows[0];
    if (!row) return { ok: false };
    return {
      ok: true,
      wallet: {
        email: row.email,
        coins: toNumber(row.coins, DEFAULT_COINS - amount),
        cash: toNumber(row.cash, DEFAULT_CASH)
      }
    };
  } catch {
    const wallet = readMemoryWallet(normalized);
    if (wallet.coins < amount) return { ok: false };
    const next = writeMemoryWallet(normalized, { coins: wallet.coins - amount, cash: wallet.cash });
    return { ok: true, wallet: next };
  }
}
