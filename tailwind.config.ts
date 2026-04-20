import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        felt: "#0d5c4a",
        rail: "#2b1b12",
        brass: "#c7a24a",
        slate: "#0d1b2a"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.12), 0 10px 30px rgba(0,0,0,0.35)"
      }
    }
  },
  plugins: []
};

export default config;