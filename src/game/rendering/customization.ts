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
  artwork?: string;
};

export const CUE_STYLES: CueStyle[] = Array.from(
  new Map<string, CueStyle>(CUE_CATALOG.map((cue: CueCatalogEntry) => [cue.id, { ...cue }])).values()
);

const TABLE_SKIN_ARTWORKS: Array<{ name: string; file: string }> = [
  { name: "Royal Crown Noir", file: "01-royal-crown-noir.png" },
  { name: "Celestial Clockwork", file: "02-celestial-clockwork.png" },
  { name: "Grand Circus", file: "03-grand-circus.png" },
  { name: "Marble Imperium", file: "04-marble-imperium.png" },
  { name: "Tech Blueprint", file: "05-tech-blueprint.png" },
  { name: "Arcade Neon", file: "06-arcade-neon.png" },
  { name: "Tropical Tiki", file: "07-tropical-tiki.png" },
  { name: "Emerald Enchanted", file: "08-emerald-enchanted.png" },
  { name: "Spartan Legion", file: "09-spartan-legion.png" },
  { name: "Art Deco Shell", file: "10-art-deco-shell.png" },
  { name: "Cyber Vector", file: "11-cyber-vector.png" },
  { name: "Vinyl Record", file: "12-vinyl-record.png" },
  { name: "Astral Zodiac", file: "13-astral-zodiac.png" },
  { name: "Aurora Frost", file: "14-aurora-frost.png" },
  { name: "Biohazard Lab", file: "15-biohazard-lab.png" },
  { name: "Street Play Graffiti", file: "16-street-play-graffiti.png" },
  { name: "Abyssal Kraken", file: "17-abyssal-kraken.png" },
  { name: "Royal Heraldry", file: "18-royal-heraldry.png" },
  { name: "Sakura Wave", file: "19-sakura-wave.png" },
  { name: "Crystal Prism", file: "20-crystal-prism.png" },
  { name: "Gothic Cathedral", file: "21-gothic-cathedral.png" },
  { name: "Card Royale", file: "22-card-royale.png" },
  { name: "Pumpkin Night", file: "23-pumpkin-night.png" },
  { name: "Western Pentagram", file: "24-western-pentagram.png" },
  { name: "Industrial Grid", file: "25-industrial-grid.png" },
  { name: "Infernal Sigil", file: "26-infernal-sigil.png" },
  { name: "Retro Sunset", file: "27-retro-sunset.png" },
  { name: "Zen Garden", file: "28-zen-garden.png" },
  { name: "Alien Glyph", file: "29-alien-glyph.png" },
  { name: "Pirate Compass", file: "30-pirate-compass.png" },
  { name: "Viking Longship", file: "31-viking-longship.png" },
  { name: "Pharaoh Scarab", file: "32-pharaoh-scarab.png" },
  { name: "Candy Pastel", file: "33-candy-pastel.png" },
  { name: "Midnight Eclipse", file: "34-midnight-eclipse.png" },
  { name: "Frontier Star", file: "35-frontier-star.png" },
  { name: "Dia De Los Muertos", file: "36-dia-de-los-muertos.png" },
  { name: "Imperial Crown Blue", file: "37-imperial-crown-blue.png" },
  { name: "Ocean Shell", file: "38-ocean-shell.png" },
  { name: "Molten Compass", file: "39-molten-compass.png" },
  { name: "Jungle Ruins", file: "40-jungle-ruins.png" },
  { name: "Tiger Calligraphy", file: "41-tiger-calligraphy.png" },
  { name: "Rusted Gears", file: "42-rusted-gears.png" },
  { name: "Galactic Spiral", file: "43-galactic-spiral.png" },
  { name: "Synth Core", file: "44-synth-core.png" },
  { name: "Desert Oasis", file: "45-desert-oasis.png" },
  { name: "Frozen Crystal", file: "46-frozen-crystal.png" },
  { name: "Blackout Eight", file: "47-blackout-eight.png" },
  { name: "Crimson Dragon", file: "48-crimson-dragon.png" },
  { name: "Classic Crown Blue", file: "49-classic-crown-blue.png" },
  { name: "Classic Green", file: "50-classic-green.png" }
];

export const TABLE_SKINS: TableSkin[] = TABLE_SKIN_ARTWORKS.map((skin, index) => ({
  id: `table_${index + 1}`,
  name: skin.name,
  felt: "#145f63",
  rail: "#2f3138",
  pocket: "#0e0e10",
  bgTop: "#0b1118",
  bgBottom: "#111a24",
  artwork: `/table-skins/${skin.file}`
}));
