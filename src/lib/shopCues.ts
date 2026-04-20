export type CueCurrency = "coins" | "cash";
export type CueGroup = "standard" | "premium" | "country";

export type CueCatalogEntry = {
  id: string;
  name: string;
  level: number;
  price: number;
  currency: CueCurrency;
  group: CueGroup;
  butt: string;
  shaft: string;
  tip: string;
  accent: string;
};

type RawCue = Omit<CueCatalogEntry, "id" | "butt" | "shaft" | "tip" | "accent">;

const STANDARD: RawCue[] = [
  { name: "Beginner Cue", level: 1, price: 0, currency: "coins", group: "standard" },
  { name: "Soccer Stars Cue", level: 1, price: 25, currency: "coins", group: "standard" },
  { name: "Skull Cue", level: 2, price: 250, currency: "coins", group: "standard" },
  { name: "Pine Cue", level: 2, price: 500, currency: "coins", group: "standard" },
  { name: "Cow Hide Cue", level: 4, price: 750, currency: "coins", group: "standard" },
  { name: "Twisted Candy Cue", level: 4, price: 1000, currency: "coins", group: "standard" },
  { name: "Bronze Cue", level: 6, price: 1250, currency: "coins", group: "standard" },
  { name: "Rosewood Cue", level: 6, price: 1500, currency: "coins", group: "standard" },
  { name: "The Gunman Cue", level: 8, price: 1750, currency: "coins", group: "standard" },
  { name: "Standard Cue", level: 8, price: 2000, currency: "coins", group: "standard" },
  { name: "Zebra Cue", level: 10, price: 2250, currency: "coins", group: "standard" },
  { name: "Sheep Cue", level: 10, price: 2500, currency: "coins", group: "standard" },
  { name: "Bearpaw Cue", level: 12, price: 2750, currency: "coins", group: "standard" },
  { name: "Royal Blue Cue", level: 12, price: 3250, currency: "coins", group: "standard" },
  { name: "Crocodile Cue", level: 14, price: 4000, currency: "coins", group: "standard" },
  { name: "The Deputy Cue", level: 14, price: 5000, currency: "coins", group: "standard" },
  { name: "Oak Cue", level: 16, price: 6000, currency: "coins", group: "standard" },
  { name: "Posh Cue", level: 16, price: 7000, currency: "coins", group: "standard" },
  { name: "Camouflage Cue", level: 18, price: 8000, currency: "coins", group: "standard" },
  { name: "Digitized Cue", level: 18, price: 9000, currency: "coins", group: "standard" },
  { name: "Test Tube Cue", level: 20, price: 10000, currency: "coins", group: "standard" },
  { name: "Blue Hope Cue", level: 20, price: 15000, currency: "coins", group: "standard" },
  { name: "The Pharaoh Cue", level: 22, price: 20000, currency: "coins", group: "standard" },
  { name: "Binder Cue", level: 22, price: 25000, currency: "coins", group: "standard" },
  { name: "Norseman Cue", level: 24, price: 30000, currency: "coins", group: "standard" },
  { name: "Steampunk Cue", level: 24, price: 35000, currency: "coins", group: "standard" },
  { name: "Barbaric Cue", level: 26, price: 40000, currency: "coins", group: "standard" },
  { name: "Tiger Cue", level: 26, price: 45000, currency: "coins", group: "standard" },
  { name: "Amber Cue", level: 28, price: 50000, currency: "coins", group: "standard" },
  { name: "Neon Cue", level: 28, price: 55000, currency: "coins", group: "standard" },
  { name: "Elven Cue", level: 30, price: 60000, currency: "coins", group: "standard" },
  { name: "Teak Cue", level: 30, price: 65000, currency: "coins", group: "standard" },
  { name: "Atom Cue", level: 32, price: 70000, currency: "coins", group: "standard" },
  { name: "Amethyst Cue", level: 32, price: 75000, currency: "coins", group: "standard" },
  { name: "Matte Black Cue", level: 34, price: 80000, currency: "coins", group: "standard" },
  { name: "Silver Cue", level: 34, price: 85000, currency: "coins", group: "standard" },
  { name: "Ash Cue", level: 36, price: 90000, currency: "coins", group: "standard" },
  { name: "Zombie Cue", level: 36, price: 100000, currency: "coins", group: "standard" },
  { name: "Flame Cue", level: 38, price: 150000, currency: "coins", group: "standard" },
  { name: "Insane Cue", level: 38, price: 175000, currency: "coins", group: "standard" },
  { name: "Crystal Cue", level: 40, price: 200000, currency: "coins", group: "standard" },
  { name: "iCue", level: 40, price: 250000, currency: "coins", group: "standard" },
  { name: "Ninja Cue", level: 42, price: 275000, currency: "coins", group: "standard" },
  { name: "Walnut Cue", level: 42, price: 300000, currency: "coins", group: "standard" },
  { name: "Frankencue", level: 44, price: 350000, currency: "coins", group: "standard" },
  { name: "Jade Cue", level: 44, price: 500000, currency: "coins", group: "standard" },
  { name: "Bounty Hunter Cue", level: 46, price: 700000, currency: "coins", group: "standard" },
  { name: "Winter Cue", level: 46, price: 800000, currency: "coins", group: "standard" },
  { name: "Gold Cue", level: 48, price: 900000, currency: "coins", group: "standard" },
  { name: "The Millionaire Cue", level: 48, price: 1000000, currency: "coins", group: "standard" },
  { name: "Solar System Cue", level: 50, price: 2000000, currency: "coins", group: "standard" },
  { name: "Diamond Cue", level: 50, price: 2500000, currency: "coins", group: "standard" },
  { name: "Multimillionaire Cue", level: 52, price: 5000000, currency: "coins", group: "standard" },
  { name: "Black Hole Cue", level: 52, price: 6000000, currency: "coins", group: "standard" }
];

const PREMIUM: RawCue[] = [
  { name: "Classic Cue", level: 1, price: 5, currency: "cash", group: "premium" },
  { name: "Tungsten Cue", level: 2, price: 70, currency: "cash", group: "premium" },
  { name: "Phantom Cue", level: 4, price: 35, currency: "cash", group: "premium" },
  { name: "Ice Cue", level: 4, price: 75, currency: "cash", group: "premium" },
  { name: "Carbon Fiber Cue", level: 6, price: 15, currency: "cash", group: "premium" },
  { name: "Leopard Cue", level: 6, price: 80, currency: "cash", group: "premium" },
  { name: "Snake Skin Cue", level: 8, price: 20, currency: "cash", group: "premium" },
  { name: "Jester Cue", level: 8, price: 85, currency: "cash", group: "premium" },
  { name: "Beech Cue", level: 10, price: 25, currency: "cash", group: "premium" },
  { name: "Titan Cue", level: 10, price: 90, currency: "cash", group: "premium" },
  { name: "Platinum Viper Cue", level: 12, price: 30, currency: "cash", group: "premium" },
  { name: "Czar Cue", level: 12, price: 110, currency: "cash", group: "premium" },
  { name: "Titanium Cue", level: 14, price: 35, currency: "cash", group: "premium" },
  { name: "Shark Cue", level: 14, price: 250, currency: "cash", group: "premium" },
  { name: "Sapphire Cue", level: 16, price: 40, currency: "cash", group: "premium" },
  { name: "Emerald Cue", level: 16, price: 315, currency: "cash", group: "premium" },
  { name: "The Sheriff Cue", level: 18, price: 45, currency: "cash", group: "premium" },
  { name: "Potter Cue", level: 18, price: 375, currency: "cash", group: "premium" },
  { name: "Ruby Cue", level: 20, price: 50, currency: "cash", group: "premium" },
  { name: "Lightning Cue", level: 20, price: 450, currency: "cash", group: "premium" },
  { name: "Majestic Cue", level: 55, price: 22, currency: "cash", group: "premium" },
  { name: "Shanghai Dragon Cue", level: 22, price: 530, currency: "cash", group: "premium" },
  { name: "Ebony Cue", level: 24, price: 60, currency: "cash", group: "premium" },
  { name: "Platinum Cue", level: 24, price: 620, currency: "cash", group: "premium" },
  { name: "Palladium Cue", level: 26, price: 65, currency: "cash", group: "premium" },
  { name: "Galaxy Cue", level: 26, price: 750, currency: "cash", group: "premium" }
];

const COUNTRIES = [
  "Algeria", "Argentina", "Australia", "Austria", "Bahrain", "Belgium", "Bosnia and Herzegovina", "Brazil", "Bulgaria", "Canada",
  "Chile", "China", "Colombia", "Denmark", "Egypt", "Finland", "France", "Germany", "Greece", "India",
  "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Japan", "Jordan", "Kuwait", "Lebanon",
  "Malaysia", "Mexico", "Morocco", "Netherlands", "New Zealand", "Norway", "Oman", "Pakistan", "Philippines", "Poland",
  "Portugal", "Puerto Rico", "Qatar", "Romania", "Russia", "Saudi Arabia", "Serbia", "Singapore", "South Africa", "South Korea",
  "Spain", "Sweden", "Switzerland", "Thailand", "Tunisia", "Turkey", "UAE", "UK", "USA", "Vietnam"
];

const COUNTRY: RawCue[] = COUNTRIES.map((country) => ({
  name: `${country} Cue`,
  level: 1,
  price: 40,
  currency: "cash",
  group: "country"
}));

function cueId(name: string): string {
  return `cue_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

function hue(seed: number, offset: number) {
  return (seed * 37 + offset) % 360;
}

const rawCatalog = [...STANDARD, ...PREMIUM, ...COUNTRY];

export const CUE_CATALOG: CueCatalogEntry[] = rawCatalog.map((cue, i) => {
  const h1 = hue(i + 4, 18);
  const h2 = hue(i + 13, 220);
  return {
    ...cue,
    id: cue.name === "Beginner Cue" ? "cue_beginner" : cueId(cue.name),
    butt: `hsl(${h1} 72% 40%)`,
    shaft: `hsl(${33 + ((i * 3) % 20)} 52% ${64 + (i % 8)}%)`,
    tip: `hsl(${h2} 58% 60%)`,
    accent: `hsl(${(h1 + h2) % 360} 75% 62%)`
  };
});

export function cueById(id: string): CueCatalogEntry | null {
  return CUE_CATALOG.find((c) => c.id === id) ?? null;
}
