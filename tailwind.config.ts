import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        panel: "var(--panel)",
        "panel-2": "var(--panel-2)",
        line: "var(--line)",
        sodium: "var(--sodium)",
        signal: "var(--signal)",
        alarm: "var(--alarm)",
        fg: "var(--text)",
        muted: "var(--muted)",
        dim: "var(--dim)",
      },
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
