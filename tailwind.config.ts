import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: "#000000",
        gold: {
          DEFAULT: "#d4af37",
          light: "#ffd700",
          dim: "#8b7520",
        },
      },
    },
  },
  plugins: [],
};

export default config;
