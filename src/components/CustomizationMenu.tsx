"use client";

import { useMemo, useState } from "react";
import { CueStyle, TableSkin } from "@/game/rendering/customization";

type Props = {
  open: boolean;
  selectedCueIndex: number;
  selectedTableIndex: number;
  cues: CueStyle[];
  tables: TableSkin[];
  ownedCueIds: string[];
  coins: number;
  cash: number;
  busyCueId: string | null;
  onSelectCue: (index: number) => void;
  onBuyCue: (index: number) => void;
  onSelectTable: (index: number) => void;
  onClose: () => void;
};

type Tab = "cues" | "tables";

const RARITY_ORDER = ["Common", "Rare", "Epic", "Legendary"] as const;

function rarityForIndex(i: number): (typeof RARITY_ORDER)[number] {
  if (i % 11 === 0) return "Legendary";
  if (i % 5 === 0) return "Epic";
  if (i % 3 === 0) return "Rare";
  return "Common";
}

function rarityClass(rarity: string): string {
  if (rarity === "Legendary") return "text-amber-300 border-amber-400/40 bg-amber-500/15";
  if (rarity === "Epic") return "text-fuchsia-300 border-fuchsia-400/40 bg-fuchsia-500/15";
  if (rarity === "Rare") return "text-cyan-300 border-cyan-400/40 bg-cyan-500/15";
  return "text-white/80 border-white/20 bg-white/10";
}

export function CustomizationMenu({
  open,
  selectedCueIndex,
  selectedTableIndex,
  cues,
  tables,
  ownedCueIds,
  coins,
  cash,
  busyCueId,
  onSelectCue,
  onBuyCue,
  onSelectTable,
  onClose
}: Props) {
  const [tab, setTab] = useState<Tab>("cues");
  const cueCount = useMemo(() => cues.length, [cues]);
  const tableCount = useMemo(() => tables.length, [tables]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-3">
      <div className="w-full max-w-6xl rounded-2xl border border-white/15 bg-[#131a28] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <div className="text-lg font-semibold text-white">Arena Locker</div>
            <div className="text-xs text-white/60">
              Owned: {ownedCueIds.length} / {cueCount} cues | {tableCount} table skins
            </div>
          </div>
          <div className="mr-3 flex items-center gap-2 rounded-lg border border-white/15 bg-black/25 px-3 py-1 text-xs text-white/90">
            <span>Coins: {coins.toLocaleString()}</span>
            <span className="text-white/40">|</span>
            <span>Cash: {cash.toLocaleString()}</span>
          </div>
          <button onClick={onClose} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white">
            Close
          </button>
        </div>

        <div className="flex gap-2 border-b border-white/10 px-4 py-2">
          <button
            onClick={() => setTab("cues")}
            className={`rounded-lg px-3 py-1.5 text-sm ${tab === "cues" ? "bg-brass text-slate" : "bg-white/10 text-white"}`}
          >
            Cues
          </button>
          <button
            onClick={() => setTab("tables")}
            className={`rounded-lg px-3 py-1.5 text-sm ${tab === "tables" ? "bg-brass text-slate" : "bg-white/10 text-white"}`}
          >
            Table Skins
          </button>
        </div>

        {tab === "cues" ? (
          <div className="max-h-[65vh] overflow-y-auto p-3">
            <div className="space-y-2">
              {cues.map((cue, idx) => {
                const rarity = cue.rarity ?? rarityForIndex(idx + 1);
                const equipped = idx === selectedCueIndex;
                const owned = ownedCueIds.includes(cue.id);
                const canAfford = cue.currency === "coins" ? coins >= cue.price : cash >= cue.price;
                const buying = busyCueId === cue.id;
                return (
                  <div key={cue.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="h-8 w-20 flex-none overflow-hidden rounded border border-white/15 bg-black/30">
                        {cue.artwork ? (
                          <div
                            className="h-full w-full bg-contain bg-center bg-no-repeat"
                            style={{ backgroundImage: `url(${cue.artwork})` }}
                          />
                        ) : null}
                      </div>
                      <div className="w-36 text-sm font-medium text-white">{cue.name}</div>
                      <div className="relative h-3.5 w-full rounded-full border border-white/15 bg-[#dadde0]">
                        <div className="absolute left-[1%] top-1/2 h-2.5 w-[14%] -translate-y-1/2 rounded-full bg-[#5a3a1f]" />
                        <div className="absolute left-[15%] top-1/2 h-2.5 w-[7%] -translate-y-1/2 rounded-full bg-black/90" />
                        <div
                          className="absolute left-[32%] top-1/2 h-2 -translate-y-1/2"
                          style={{ width: "15%", backgroundColor: cue.flagColors[0], clipPath: "polygon(0 0, 100% 20%, 88% 100%, 0 80%)" }}
                        />
                        <div
                          className="absolute left-[45%] top-1/2 h-2 -translate-y-1/2"
                          style={{ width: "15%", backgroundColor: cue.flagColors[1], clipPath: "polygon(12% 0, 100% 20%, 88% 100%, 0 80%)" }}
                        />
                        <div
                          className="absolute left-[58%] top-1/2 h-2 -translate-y-1/2"
                          style={{ width: "15%", backgroundColor: cue.flagColors[2], clipPath: "polygon(12% 0, 100% 20%, 88% 100%, 0 80%)" }}
                        />
                        <div className="absolute right-[1%] top-1/2 h-2.5 w-[2.5%] -translate-y-1/2 rounded-full bg-[#a0a5ad]" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {cue.countryTheme ? (
                        <>
                          <span className="rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] text-white/85">{cue.countryTheme}</span>
                          <div className="flex items-center overflow-hidden rounded border border-white/20">
                            {cue.flagColors.map((color) => (
                              <span key={`${cue.id}-${color}`} className="h-3 w-3" style={{ backgroundColor: color }} />
                            ))}
                          </div>
                        </>
                      ) : null}
                      <span className="rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] text-white/85">
                        {cue.price.toLocaleString()} {cue.currency === "coins" ? "coins" : "cash"}
                      </span>
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] ${rarityClass(rarity)}`}>{rarity}</span>
                      {owned ? (
                        <button
                          onClick={() => onSelectCue(idx)}
                          disabled={buying}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium ${equipped ? "bg-emerald-500/80 text-white" : "bg-white/10 text-white"}`}
                        >
                          {equipped ? "Equipped" : "Equip"}
                        </button>
                      ) : (
                        <button
                          onClick={() => onBuyCue(idx)}
                          disabled={!canAfford || buying}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium ${canAfford ? "bg-brass text-slate" : "bg-white/10 text-white/45"}`}
                        >
                          {buying ? "Buying..." : "Buy"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tables.map((skin, idx) => {
                const rarity = rarityForIndex(idx + 1);
                const equipped = idx === selectedTableIndex;
                return (
                  <div key={skin.id} className="rounded-xl border border-white/10 bg-white/5 p-2">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="truncate text-sm font-medium text-white">{skin.name}</div>
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] ${rarityClass(rarity)}`}>{rarity}</span>
                    </div>
                    {skin.artwork ? (
                      <div className="mb-2 h-24 overflow-hidden rounded-lg border border-white/15">
                        <div
                          className="h-full w-full bg-cover bg-center"
                          style={{ backgroundImage: `url(${skin.artwork})` }}
                        />
                      </div>
                    ) : (
                      <div className="mb-2 h-24 rounded-lg p-2" style={{ background: `linear-gradient(180deg, ${skin.bgTop}, ${skin.bgBottom})` }}>
                        <div className="h-full rounded-md p-2" style={{ backgroundColor: skin.rail }}>
                          <div className="relative h-full rounded-sm" style={{ backgroundColor: skin.felt }}>
                            <div className="absolute left-0 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ backgroundColor: skin.pocket }} />
                            <div className="absolute right-0 top-0 h-3 w-3 translate-x-1/2 -translate-y-1/2 rounded-full" style={{ backgroundColor: skin.pocket }} />
                            <div className="absolute bottom-0 left-0 h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full" style={{ backgroundColor: skin.pocket }} />
                            <div className="absolute bottom-0 right-0 h-3 w-3 translate-x-1/2 translate-y-1/2 rounded-full" style={{ backgroundColor: skin.pocket }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => onSelectTable(idx)}
                      className={`w-full rounded-md px-2.5 py-1.5 text-xs font-medium ${equipped ? "bg-emerald-500/80 text-white" : "bg-white/10 text-white"}`}
                    >
                      {equipped ? "Equipped" : "Equip"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
