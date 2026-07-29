import type { Metadata } from "next";
import { LanguageProvider } from "./i18n/LanguageProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "PoAP Viewer",
  description: "Plan on a Page — vista ejecutiva de programa",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
