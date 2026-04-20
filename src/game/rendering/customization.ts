import { CUE_CATALOG, CueCatalogEntry } from "@/lib/shopCues";

export type CueStyle = {
  id: string;
  name: string;
  level: number;
  price: number;
  currency: "coins" | "cash";
  group: "standard" | "premium" | "country";
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

export const CUE_STYLES: CueStyle[] = CUE_CATALOG.map((cue: CueCatalogEntry) => ({ ...cue }));

const hue = (seed: number, offset: number) => (seed * 41 + offset) % 360;

export const TABLE_SKINS: TableSkin[] = Array.from({ length: 50 }, (_, i) => {
  const feltHue = hue(i + 5, 120);
  const railHue = hue(i + 9, 20);
  const skyHue = hue(i + 4, 200);
  return {
    id: `table_${i + 1}`,
    name: `Arena Felt ${i + 1}`,
    felt: `hsl(${feltHue} 55% ${29 + (i % 10)}%)`,
    rail: `hsl(${railHue} 48% ${20 + (i % 14)}%)`,
    pocket: `hsl(${(railHue + 180) % 360} 20% 7%)`,
    bgTop: `hsl(${skyHue} 58% ${8 + (i % 12)}%)`,
    bgBottom: `hsl(${(skyHue + 40) % 360} 45% ${10 + (i % 10)}%)`
  };
});
