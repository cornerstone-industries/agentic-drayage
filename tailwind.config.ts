import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Channels let every opacity modifier work (border-line/60, bg-sodium/15, ...).
      colors: {
        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
        panel: "rgb(var(--panel-rgb) / <alpha-value>)",
        "panel-2": "rgb(var(--panel-2-rgb) / <alpha-value>)",
        line: "rgb(var(--line-rgb) / <alpha-value>)",
        sodium: "rgb(var(--sodium-rgb) / <alpha-value>)",
        signal: "rgb(var(--signal-rgb) / <alpha-value>)",
        alarm: "rgb(var(--alarm-rgb) / <alpha-value>)",
        fg: "rgb(var(--text-rgb) / <alpha-value>)",
        muted: "rgb(var(--muted-rgb) / <alpha-value>)",
        dim: "rgb(var(--dim-rgb) / <alpha-value>)",
      },
      borderColor: { DEFAULT: "rgb(var(--line-rgb) / <alpha-value>)" },
      fontFamily: {
        sans: ["var(--font-archivo)", "system-ui", "sans-serif"],
        display: ["var(--font-archivo)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        "ring-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(255,176,32,0.55)" },
          "50%": { boxShadow: "0 0 0 6px rgba(255,176,32,0)" },
        },
        "live-glow": {
          "0%, 100%": { boxShadow: "0 0 10px 0 rgba(46,230,197,0.45)" },
          "50%": { boxShadow: "0 0 18px 2px rgba(46,230,197,0.7)" },
        },
        bar: {
          "0%, 100%": { transform: "scaleY(0.18)" },
          "50%": { transform: "scaleY(1)" },
        },
        blink: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0" } },
      },
      animation: {
        "ring-pulse": "ring-pulse 1.1s ease-out infinite",
        "live-glow": "live-glow 2.2s ease-in-out infinite",
        blink: "blink 1s steps(1) infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
