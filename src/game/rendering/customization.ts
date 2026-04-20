import { CUE_CATALOG, CueCatalogEntry } from "@/lib/shopCues";

export type CueStyle = {
  id: string;
  name: string;
  level: number;
  price: number;
  currency: "coins" | "cash";
  group: "standard" | "premium" | "country";
  countryTheme: string;
  flagColors: [string, string, string];
  butt: string;
  shaft: string;
  tip: string;
  accent: string;
};

export type TableSkin = {
  id: string;
  name: string;
  felt: string;
  rail: string;
  pocket: string;
  bgTop: string;
  bgBottom: string;
};

export const CUE_STYLES: CueStyle[] = Array.from(
  new Map<string, CueStyle>(CUE_CATALOG.map((cue: CueCatalogEntry) => [cue.id, { ...cue }])).values()
);

const FELT_TONES = [
  "#136b45",
  "#1d7b52",
  "#1a5f8a",
  "#0f6f70",
  "#3f7448",
  "#2f5f7a",
  "#4a3c6e",
  "#5f4f2f",
  "#6d3f38",
  "#304f3e"
];

const RAIL_TONES = [
  "#5a3c2b",
  "#6f4a33",
  "#4a2f23",
  "#7b5a3e",
  "#53362a",
  "#6a3d2f",
  "#734f35",
  "#4f3328",
  "#6b4f3b",
  "#5c4336"
];

const BACKDROP_PAIRS: Array<{ top: string; bottom: string }> = [
  { top: "#0b1620", bottom: "#111d2b" },
  { top: "#101821", bottom: "#1a2330" },
  { top: "#1a1310", bottom: "#281c18" },
  { top: "#111014", bottom: "#1f1d25" },
  { top: "#0e1514", bottom: "#17211f" },
  { top: "#15110e", bottom: "#231b14" }
];

export const TABLE_SKINS: TableSkin[] = Array.from({ length: 50 }, (_, i) => {
  const felt = FELT_TONES[i % FELT_TONES.length];
  const rail = RAIL_TONES[(i * 3 + 2) % RAIL_TONES.length];
  const back = BACKDROP_PAIRS[(i * 5 + 1) % BACKDROP_PAIRS.length];
  return {
    id: `table_${i + 1}`,
    name: `Arena Felt ${i + 1}`,
    felt,
    rail,
    pocket: "#0f0f10",
    bgTop: back.top,
    bgBottom: back.bottom
  };
});
