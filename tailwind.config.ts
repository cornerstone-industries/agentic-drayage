import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Paper and ink: freight runs on carbon forms, rubber stamps and highlighters.
      // Channels let every opacity modifier work (border-line/60, bg-stamp/10, ...).
      colors: {
        ink: "rgb(var(--paper-rgb) / <alpha-value>)", // page paper (legacy name)
        paper: "rgb(var(--paper-rgb) / <alpha-value>)",
        panel: "rgb(var(--sheet-rgb) / <alpha-value>)",
        sheet: "rgb(var(--sheet-rgb) / <alpha-value>)",
        "panel-2": "rgb(var(--sheet-2-rgb) / <alpha-value>)",
        canary: "rgb(var(--canary-rgb) / <alpha-value>)",
        blush: "rgb(var(--blush-rgb) / <alpha-value>)",
        line: "rgb(var(--rule-rgb) / <alpha-value>)",
        rule: "rgb(var(--rule-rgb) / <alpha-value>)",
        sodium: "rgb(var(--crane-rgb) / <alpha-value>)", // primary action (legacy name)
        crane: "rgb(var(--crane-rgb) / <alpha-value>)",
        signal: "rgb(var(--live-rgb) / <alpha-value>)", // live line (legacy name)
        live: "rgb(var(--live-rgb) / <alpha-value>)",
        stamp: "rgb(var(--stamp-rgb) / <alpha-value>)",
        alarm: "rgb(var(--red-rgb) / <alpha-value>)",
        red: "rgb(var(--red-rgb) / <alpha-value>)",
        marker: "rgb(var(--marker-rgb) / <alpha-value>)",
        fg: "rgb(var(--text-rgb) / <alpha-value>)",
        muted: "rgb(var(--muted-rgb) / <alpha-value>)",
        dim: "rgb(var(--dim-rgb) / <alpha-value>)",
        steel: "rgb(var(--steel-rgb) / <alpha-value>)",
      },
      borderColor: { DEFAULT: "rgb(var(--rule-rgb) / <alpha-value>)" },
      fontFamily: {
        sans: ["var(--font-barlow)", "system-ui", "sans-serif"],
        display: ["var(--font-barlow-cond)", "system-ui", "sans-serif"],
        cond: ["var(--font-barlow-cond)", "system-ui", "sans-serif"],
        stencil: ["var(--font-stencil)", "var(--font-barlow-cond)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        ring: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "10%": { transform: "rotate(-2.2deg)" },
          "20%": { transform: "rotate(2deg)" },
          "30%": { transform: "rotate(-1.6deg)" },
          "40%": { transform: "rotate(1.2deg)" },
          "50%": { transform: "rotate(0deg)" },
        },
        "live-dot": {
          "0%": { boxShadow: "0 0 0 0 rgba(15,138,95,0.55)" },
          "100%": { boxShadow: "0 0 0 9px rgba(15,138,95,0)" },
        },
        blink: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0" } },
      },
      animation: {
        ring: "ring 1.2s ease-in-out infinite",
        "live-dot": "live-dot 1.4s ease-out infinite",
        blink: "blink 1s steps(1) infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
