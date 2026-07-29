import type { Metadata } from "next";
import { Big_Shoulders_Display, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "PoAP Viewer",
  description: "Plan on a Page — vista ejecutiva de programa",
};

// Three-font system: a condensed industrial display face for headings (the
// "console readout" moments), a workhorse sans for body copy, and a
// monospace for anything tabular/technical — dates, breadcrumbs, status
// labels, button copy — so the app reads like an engineering control panel
// rather than a generic dashboard. Exposed as CSS variables and consumed
// from globals.css / the CSS Modules, never referenced by class name here.
const display = Big_Shoulders_Display({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display-raw",
});
const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body-raw",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono-raw",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
