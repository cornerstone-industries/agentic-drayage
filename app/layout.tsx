import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Semi_Condensed, Big_Shoulders_Stencil, IBM_Plex_Mono } from "next/font/google";
import { MotionProvider } from "@/components/motion-provider";
import { InkFilters } from "@/components/freight/ink-filters";
import "./globals.css";

const stencil = Big_Shoulders_Stencil({ subsets: ["latin"], variable: "--font-stencil", display: "swap" });
const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow", display: "swap" });
const barlowCond = Barlow_Semi_Condensed({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-barlow-cond", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

const defaultUrl = process.env.APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "PortCall",
  description: "A phone line to the freight world for AI agents: three drayage quotes in two minutes, booked and paid before late fees hit.",
};

export const viewport: Viewport = { themeColor: "#EEF0EB" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${stencil.variable} ${barlow.variable} ${barlowCond.variable} ${plexMono.variable}`}>
      <body className="font-sans antialiased">
        <InkFilters />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
