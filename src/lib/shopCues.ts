export type CueCurrency = "coins" | "cash";
export type CueGroup = "standard" | "premium" | "country";
export type CueRarity = "Common" | "Rare" | "Epic" | "Legendary";

export type CueCatalogEntry = {
  id: string;
  name: string;
  level: number;
  price: number;
  currency: CueCurrency;
  group: CueGroup;
  rarity: CueRarity;
  countryTheme?: string;
  flagColors: [string, string, string];
  artwork?: string;
  previewArtwork?: string;
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
  rarity: "Common",
  artwork: "/cues/set1/00-classic-cue.webp",
  previewArtwork: "/cues/set1/00-classic-cue.webp",
  flagColors: ["#7a5a33", "#c6ab79", "#8e5d31"],
  butt: "#5a3a1f",
  shaft: "#e8d4a8",
  tip: "#4f5963",
  accent: "#8e5d31"
};

const SET_ONE_CUES: CueCatalogEntry[] = [
  {
    id: "cue_celestial_dragon",
    name: "Celestial Dragon Cue",
    level: 1,
    price: 1,
    currency: "coins",
    group: "premium",
    rarity: "Legendary",
    flagColors: ["#132967", "#e2be5f", "#2b6ed4"],
    artwork: "/cues/set1/01-celestial-dragon-cue.webp",
    previewArtwork: "/cues/set1/01-celestial-dragon-cue.webp",
    butt: "#1f2f7a",
    shaft: "#d9ba66",
    tip: "#3d85ff",
    accent: "#efd37d"
  },
  {
    id: "cue_neon_circuit",
    name: "Neon Circuit Cue",
    level: 1,
    price: 1,
    currency: "coins",
    group: "premium",
    rarity: "Epic",
    flagColors: ["#00d0ff", "#1f2035", "#f042ff"],
    artwork: "/cues/set1/02-neon-circuit-cue.webp",
    previewArtwork: "/cues/set1/02-neon-circuit-cue.webp",
    butt: "#2c2f43",
    shaft: "#12b8df",
    tip: "#f042ff",
    accent: "#7a87ff"
  },
  {
    id: "cue_pharaoh_eclipse",
    name: "Pharaoh's Eclipse Cue",
    level: 1,
    price: 1,
    currency: "coins",
    group: "premium",
    rarity: "Legendary",
    flagColors: ["#0f0d11", "#c39a44", "#f0ca72"],
    artwork: "/cues/set1/03-pharaoh-eclipse-cue.webp",
    previewArtwork: "/cues/set1/03-pharaoh-eclipse-cue.webp",
    butt: "#1d1810",
    shaft: "#c79c41",
    tip: "#e6be68",
    accent: "#705528"
  },
  {
    id: "cue_glacier_crown",
    name: "Glacier Crown Cue",
    level: 1,
    price: 1,
    currency: "coins",
    group: "premium",
    rarity: "Epic",
    flagColors: ["#78ccff", "#d8ecff", "#3b88ff"],
    artwork: "/cues/set1/04-glacier-crown-cue.webp",
    previewArtwork: "/cues/set1/04-glacier-crown-cue.webp",
    butt: "#97d3ff",
    shaft: "#d8f0ff",
    tip: "#5f9fff",
    accent: "#9ec7ea"
  },
  {
    id: "cue_ember_phoenix",
    name: "Ember Phoenix Cue",
    level: 1,
    price: 1,
    currency: "coins",
    group: "premium",
    rarity: "Legendary",
    flagColors: ["#7a1f19", "#f08b2c", "#ffd067"],
    artwork: "/cues/set1/05-ember-phoenix-cue.webp",
    previewArtwork: "/cues/set1/05-ember-phoenix-cue.webp",
    butt: "#7f281f",
    shaft: "#f08b2c",
    tip: "#ffb34d",
    accent: "#cc4f2c"
  },
  {
    id: "cue_royal_obsidian",
    name: "Royal Obsidian Cue",
    level: 1,
    price: 1,
    currency: "coins",
    group: "premium",
    rarity: "Epic",
    flagColors: ["#0f1012", "#8d2626", "#c08e40"],
    artwork: "/cues/set1/06-royal-obsidian-cue.webp",
    previewArtwork: "/cues/set1/06-royal-obsidian-cue.webp",
    butt: "#18191d",
    shaft: "#282a2e",
    tip: "#be2c2c",
    accent: "#cda85a"
  },
  {
    id: "cue_coral_kraken",
    name: "Coral Kraken Cue",
    level: 1,
    price: 1,
    currency: "coins",
    group: "premium",
    rarity: "Rare",
    flagColors: ["#0f6d82", "#e9889f", "#67bfd3"],
    artwork: "/cues/set1/07-coral-kraken-cue.webp",
    previewArtwork: "/cues/set1/07-coral-kraken-cue.webp",
    butt: "#1f8393",
    shaft: "#73c2d0",
    tip: "#ecd3d8",
    accent: "#e37f96"
  },
  {
    id: "cue_verdant_relic",
    name: "Verdant Relic Cue",
    level: 1,
    price: 1,
    currency: "coins",
    group: "premium",
    rarity: "Rare",
    flagColors: ["#23301e", "#5f7f47", "#c6a062"],
    artwork: "/cues/set1/08-verdant-relic-cue.webp",
    previewArtwork: "/cues/set1/08-verdant-relic-cue.webp",
    butt: "#2f3e29",
    shaft: "#637b44",
    tip: "#49a765",
    accent: "#b8863d"
  },
  {
    id: "cue_arcane_lotus",
    name: "Arcane Lotus Cue",
    level: 1,
    price: 1,
    currency: "coins",
    group: "premium",
    rarity: "Epic",
    flagColors: ["#40256d", "#a06bff", "#55d3d3"],
    artwork: "/cues/set1/09-arcane-lotus-cue.webp",
    previewArtwork: "/cues/set1/09-arcane-lotus-cue.webp",
    butt: "#523380",
    shaft: "#8f66cc",
    tip: "#a569ff",
    accent: "#66d2c7"
  },
  {
    id: "cue_solar_flare",
    name: "Solar Flare Cue",
    level: 1,
    price: 1,
    currency: "coins",
    group: "premium",
    rarity: "Legendary",
    flagColors: ["#ffd17d", "#e2a24e", "#fbf2dc"],
    artwork: "/cues/set1/10-solar-flare-cue.webp",
    previewArtwork: "/cues/set1/10-solar-flare-cue.webp",
    butt: "#f7e1bb",
    shaft: "#deac67",
    tip: "#ffe28e",
    accent: "#e38a35"
  }
];

export const CUE_CATALOG: CueCatalogEntry[] = [CLASIC_CUE, ...SET_ONE_CUES];

export function cueById(id: string): CueCatalogEntry | null {
  return CUE_CATALOG.find((c) => c.id === id) ?? null;
}
