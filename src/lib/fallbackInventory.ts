import { prisma } from "@/lib/prisma";
import { DEFAULT_CUE_ID } from "@/lib/shopCues";

type InventoryShape = {
  ownedCueIds: string[];
  equippedCueId: string;
};

type MemoryInventory = {
  ownedCueIds: string[];
  equippedCueId: string;
};

declare global {
  var arenaInventoryFallbackMemory: Map<string, MemoryInventory> | undefined;
}

const DEFAULT_OWNED = [DEFAULT_CUE_ID];
const DEFAULT_EQUIPPED = DEFAULT_CUE_ID;

const memoryInventory = global.arenaInventoryFallbackMemory ?? new Map<string, MemoryInventory>();
if (!global.arenaInventoryFallbackMemory) {
  global.arenaInventoryFallbackMemory = memoryInventory;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeOwnedCueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_OWNED];
  return [...DEFAULT_OWNED];
}

function parseOwnedCueIdsText(raw: unknown): string[] {
  if (typeof raw !== "string") return [...DEFAULT_OWNED];
  const parts = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return normalizeOwnedCueIds(parts);
}

function serializeOwnedCueIds(ids: string[]): string {
  return normalizeOwnedCueIds(ids).join(",");
}

function readMemoryInventory(email: string): InventoryShape {
  const normalized = normalizeEmail(email);
  const existing = memoryInventory.get(normalized);
  const next: MemoryInventory = existing
    ? {
        ownedCueIds: normalizeOwnedCueIds(existing.ownedCueIds),
        equippedCueId:
          typeof existing.equippedCueId === "string" && existing.equippedCueId.length > 0
            ? existing.equippedCueId
            : DEFAULT_EQUIPPED
      }
    : { ownedCueIds: [...DEFAULT_OWNED], equippedCueId: DEFAULT_EQUIPPED };
  memoryInventory.set(normalized, next);
  return { ownedCueIds: [...next.ownedCueIds], equippedCueId: next.equippedCueId };
}

function writeMemoryInventory(email: string, inventory: InventoryShape): InventoryShape {
  const normalized = normalizeEmail(email);
  const owned = normalizeOwnedCueIds(inventory.ownedCueIds);
  const equipped = owned.includes(inventory.equippedCueId) ? inventory.equippedCueId : DEFAULT_EQUIPPED;
  const next = {
    ownedCueIds: owned,
    equippedCueId: equipped
  };
  memoryInventory.set(normalized, next);
  return { ...next, ownedCueIds: [...next.ownedCueIds] };
}

async function ensureFallbackInventoryTable(): Promise<boolean> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS arena_inventory_fallback (
        email TEXT PRIMARY KEY,
        owned_cue_ids TEXT NOT NULL DEFAULT '${DEFAULT_CUE_ID}',
        equipped_cue_id TEXT NOT NULL DEFAULT '${DEFAULT_CUE_ID}',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    return true;
  } catch {
    return false;
  }
}

export async function ensureFallbackInventoryByEmail(email: string): Promise<InventoryShape> {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ownedCueIds: [...DEFAULT_OWNED], equippedCueId: DEFAULT_EQUIPPED };

  const tableReady = await ensureFallbackInventoryTable();
  if (!tableReady) return readMemoryInventory(normalized);

  try {
    await prisma.$executeRaw`
      INSERT INTO arena_inventory_fallback (email)
      VALUES (${normalized})
      ON CONFLICT (email) DO NOTHING
    `;
    const rows = await prisma.$queryRaw<
      Array<{ owned_cue_ids: unknown; equipped_cue_id: unknown }>
    >`
      SELECT owned_cue_ids, equipped_cue_id
      FROM arena_inventory_fallback
      WHERE email = ${normalized}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return { ownedCueIds: [...DEFAULT_OWNED], equippedCueId: DEFAULT_EQUIPPED };
    const ownedCueIds = parseOwnedCueIdsText(row.owned_cue_ids);
    const equipped =
      typeof row.equipped_cue_id === "string" && ownedCueIds.includes(row.equipped_cue_id)
        ? row.equipped_cue_id
        : DEFAULT_EQUIPPED;
    return { ownedCueIds, equippedCueId: equipped };
  } catch {
    return readMemoryInventory(normalized);
  }
}

export async function setFallbackInventoryByEmail(email: string, inventory: InventoryShape): Promise<InventoryShape> {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ownedCueIds: [...DEFAULT_OWNED], equippedCueId: DEFAULT_EQUIPPED };

  const ownedCueIds = normalizeOwnedCueIds(inventory.ownedCueIds);
  const equippedCueId = ownedCueIds.includes(inventory.equippedCueId)
    ? inventory.equippedCueId
    : DEFAULT_EQUIPPED;

  const tableReady = await ensureFallbackInventoryTable();
  if (!tableReady) return writeMemoryInventory(normalized, { ownedCueIds, equippedCueId });

  try {
    const serialized = serializeOwnedCueIds(ownedCueIds);
    await prisma.$executeRaw`
      INSERT INTO arena_inventory_fallback (email, owned_cue_ids, equipped_cue_id)
      VALUES (${normalized}, ${serialized}, ${equippedCueId})
      ON CONFLICT (email)
      DO UPDATE SET
        owned_cue_ids = EXCLUDED.owned_cue_ids,
        equipped_cue_id = EXCLUDED.equipped_cue_id,
        updated_at = NOW()
    `;
    return { ownedCueIds, equippedCueId };
  } catch {
    return writeMemoryInventory(normalized, { ownedCueIds, equippedCueId });
  }
}

export async function addFallbackOwnedCue(email: string, cueId: string): Promise<InventoryShape> {
  const current = await ensureFallbackInventoryByEmail(email);
  const owned = current.ownedCueIds.includes(cueId)
    ? current.ownedCueIds
    : [...current.ownedCueIds, cueId];
  return setFallbackInventoryByEmail(email, {
    ownedCueIds: owned,
    equippedCueId: cueId
  });
}

export async function equipFallbackCue(email: string, cueId: string): Promise<InventoryShape | null> {
  const current = await ensureFallbackInventoryByEmail(email);
  if (!current.ownedCueIds.includes(cueId)) return null;
  return setFallbackInventoryByEmail(email, {
    ownedCueIds: current.ownedCueIds,
    equippedCueId: cueId
  });
}
