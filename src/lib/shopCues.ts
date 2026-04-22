export type CueCurrency = "coins" | "cash";
export type CueGroup = "standard" | "premium" | "country";

export type CueCatalogEntry = {
  id: string;
  name: string;
  level: number;
  price: number;
  currency: CueCurrency;
  group: CueGroup;
  countryTheme: string;
  flagColors: [string, string, string];
  butt: string;
  shaft: string;
  tip: string;
  accent: string;
};

export const DEFAULT_CUE_ID = "cue_classic";

const CLASIC_CUE: CueCatalogEntry = {
  id: DEFAULT_CUE_ID,
  name: "Clasic",
  level: 1,
  price: 0,
  currency: "coins",
  group: "standard",
  countryTheme: "Arena",
  flagColors: ["#d04b42", "#f5f5f5", "#2e5fbd"],
  butt: "#5a3a1f",
  shaft: "#e8d4a8",
  tip: "#4f5963",
  accent: "#8e5d31"
};

export const CUE_CATALOG: CueCatalogEntry[] = [CLASIC_CUE];

export function cueById(id: string): CueCatalogEntry | null {
  return CUE_CATALOG.find((c) => c.id === id) ?? null;
}
