"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { translations } from "./translations";

const STORAGE_KEY = "poap-locale";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (typeof translations)[Locale];
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Both the server-rendered HTML and the first client render always use
 * DEFAULT_LOCALE, so they match and hydration never mismatches — a saved
 * preference (if any) is applied a moment later, client-only, in the
 * effect below. That's a deliberate trade-off: a returning English-locale
 * user sees one frame of Spanish rather than a hydration warning.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "es" || saved === "en") setLocaleState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function setLocale(next: Locale) {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t: translations[locale] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
