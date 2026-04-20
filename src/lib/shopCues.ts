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

type RawCue = {
  name: string;
  level: number;
  price: number;
  currency: CueCurrency;
  group: CueGroup;
};

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

const FLAG_THEMES: { country: string; colors: [string, string, string] }[] = [
  { country: "USA", colors: ["#b22234", "#ffffff", "#3c3b6e"] },
  { country: "UK", colors: ["#012169", "#ffffff", "#c8102e"] },
  { country: "Germany", colors: ["#000000", "#dd0000", "#ffce00"] },
  { country: "France", colors: ["#0055a4", "#ffffff", "#ef4135"] },
  { country: "Italy", colors: ["#009246", "#ffffff", "#ce2b37"] },
  { country: "Spain", colors: ["#aa151b", "#f1bf00", "#aa151b"] },
  { country: "Romania", colors: ["#002b7f", "#fcd116", "#ce1126"] },
  { country: "Brazil", colors: ["#009b3a", "#ffdf00", "#002776"] },
  { country: "Argentina", colors: ["#75aadb", "#ffffff", "#75aadb"] },
  { country: "Japan", colors: ["#ffffff", "#bc002d", "#ffffff"] },
  { country: "Canada", colors: ["#d80621", "#ffffff", "#d80621"] },
  { country: "Sweden", colors: ["#006aa7", "#fecc00", "#006aa7"] },
  { country: "Norway", colors: ["#ba0c2f", "#ffffff", "#00205b"] },
  { country: "Netherlands", colors: ["#ae1c28", "#ffffff", "#21468b"] },
  { country: "Belgium", colors: ["#000000", "#fae042", "#ed2939"] },
  { country: "Ireland", colors: ["#169b62", "#ffffff", "#ff883e"] },
  { country: "Portugal", colors: ["#006600", "#ff0000", "#ffcc00"] },
  { country: "Turkey", colors: ["#e30a17", "#ffffff", "#e30a17"] },
  { country: "UAE", colors: ["#00732f", "#ffffff", "#000000"] },
  { country: "India", colors: ["#ff9933", "#ffffff", "#138808"] }
];

function cueId(name: string): string {
  return `cue_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

function hue(seed: number, offset: number) {
  return (seed * 37 + offset) % 360;
}

const rawCatalog = [...STANDARD, ...PREMIUM, ...COUNTRY];

export const CUE_CATALOG: CueCatalogEntry[] = rawCatalog.map((cue, i) => {
  const flag = FLAG_THEMES[i % FLAG_THEMES.length];
  const woodHue = hue(i + 11, 22);
  const woodDark = `hsl(${woodHue} 44% 30%)`;
  const woodMid = `hsl(${woodHue} 38% 42%)`;
  const mapleShaft = `hsl(${34 + ((i * 2) % 12)} 48% 70%)`;
  const normalizedName =
    cue.group === "country"
      ? `${flag.country} National Cue`
      : cue.group === "premium"
        ? `${flag.country} Pro Cue`
        : `${flag.country} Classic Cue`;

  return {
    ...cue,
    name: normalizedName,
    id: cue.name === "Beginner Cue" ? "cue_beginner" : cueId(cue.name),
    countryTheme: flag.country,
    flagColors: flag.colors,
    butt: woodDark,
    shaft: mapleShaft,
    tip: "#4f5963",
    accent: woodMid
  };
});

export function cueById(id: string): CueCatalogEntry | null {
  return CUE_CATALOG.find((c) => c.id === id) ?? null;
}
