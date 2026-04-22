import { TABLE } from "@/game/constants";
import { TableConfig } from "@/game/types";
import { prisma } from "@/lib/prisma";

const DEFAULT_TABLE_CONFIG: TableConfig = { ...TABLE };
const TABLE_NAME = "arena_table_config";

const LIMITS = {
  width: { min: 760, max: 1800 },
  height: { min: 380, max: 960 },
  rail: { min: 18, max: 120 },
  pocketRadius: { min: 12, max: 72 },
  ballRadius: { min: 8, max: 24 }
} as const;

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function normalizeTableConfig(input: unknown): TableConfig {
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const width = clamp(
    toFiniteNumber(src.width) ?? DEFAULT_TABLE_CONFIG.width,
    LIMITS.width.min,
    LIMITS.width.max
  );
  const height = clamp(
    toFiniteNumber(src.height) ?? DEFAULT_TABLE_CONFIG.height,
    LIMITS.height.min,
    LIMITS.height.max
  );
  const ballRadius = clamp(
    toFiniteNumber(src.ballRadius) ?? DEFAULT_TABLE_CONFIG.ballRadius,
    LIMITS.ballRadius.min,
    LIMITS.ballRadius.max
  );
  const maxRail = Math.max(LIMITS.rail.min, Math.min(LIMITS.rail.max, Math.min(width, height) / 2 - ballRadius - 2));
  const rail = clamp(toFiniteNumber(src.rail) ?? DEFAULT_TABLE_CONFIG.rail, LIMITS.rail.min, maxRail);
  const maxPocketRadius = Math.max(
    LIMITS.pocketRadius.min,
    Math.min(LIMITS.pocketRadius.max, rail - ballRadius * 0.15)
  );
  const pocketRadius = clamp(
    toFiniteNumber(src.pocketRadius) ?? DEFAULT_TABLE_CONFIG.pocketRadius,
    LIMITS.pocketRadius.min,
    maxPocketRadius
  );

  return {
    width: round2(width),
    height: round2(height),
    rail: round2(rail),
    pocketRadius: round2(pocketRadius),
    ballRadius: round2(ballRadius)
  };
}

async function ensureTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id SMALLINT PRIMARY KEY,
      config JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function getArenaTableConfig(): Promise<TableConfig> {
  try {
    await ensureTable();
    const rows = await prisma.$queryRaw<Array<{ config: unknown }>>`
      SELECT config
      FROM arena_table_config
      WHERE id = 1
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
      const fallback = normalizeTableConfig(DEFAULT_TABLE_CONFIG);
      await prisma.$executeRaw`
        INSERT INTO arena_table_config (id, config)
        VALUES (1, ${JSON.stringify(fallback)}::jsonb)
        ON CONFLICT (id) DO NOTHING
      `;
      return fallback;
    }
    return normalizeTableConfig(row.config);
  } catch (error) {
    console.error("table-config:get failed", error);
    return { ...DEFAULT_TABLE_CONFIG };
  }
}

export async function saveArenaTableConfig(input: unknown): Promise<TableConfig> {
  const next = normalizeTableConfig(input);
  await ensureTable();
  await prisma.$executeRaw`
    INSERT INTO arena_table_config (id, config, updated_at)
    VALUES (1, ${JSON.stringify(next)}::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()
  `;
  return next;
}

