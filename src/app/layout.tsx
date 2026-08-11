import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { LanguageProvider } from "./i18n/LanguageProvider";
import { ProjectsProvider } from "./ProjectsProvider";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "PoAP Viewer",
  description: "Plan on a Page — vista ejecutiva de programa",
};

// Reads the theme choice straight out of localStorage before React ever
// hydrates, so the very first paint already has the right data-theme
// attribute — otherwise a light-mode user would see a flash of the (now
// default) dark theme every load. Synchronous and inline on purpose: a
// next/script (even beforeInteractive) still runs after some paint work,
// which is exactly the flash this exists to prevent. Reads the same
// "poap-settings" blob useAppSettings already owns, rather than a second
// key, so there's one source of truth for what got saved.
const THEME_INIT_SCRIPT = `
  try {
    var saved = JSON.parse(localStorage.getItem('poap-settings') || '{}');
    if (saved.theme === 'light' || saved.theme === 'rainbow') {
      document.documentElement.setAttribute('data-theme', saved.theme);
    }
  } catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={jakarta.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <LanguageProvider>
          <ProjectsProvider>{children}</ProjectsProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
