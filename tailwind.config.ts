import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "/Users/wen/Downloads/figma-design/src/**/*.{js,ts,jsx,tsx,mdx}",
    "/Users/wen/Downloads/销售订单界面 4/src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: [
    {
      pattern:
        /(bg|text|border|shadow|from|via|to|focus:border|hover:border|group-hover\/card:border)-(cyan|violet|fuchsia|emerald|teal|green|orange|rose|pink|blue|indigo|purple|amber|yellow|slate|zinc|neutral|gray|stone)-([0-9]{3})(\/[0-9]{1,2})?/,
      variants: ["hover", "focus", "group-hover", "group-hover/card"],
    },
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
