import { GB, IT } from "country-flag-icons/react/3x2";

const FLAGS = { en: GB, it: IT } as const;

export function FlagIcon({ lang, className }: { lang: "en" | "it"; className?: string }) {
  const Flag = FLAGS[lang];
  return <Flag className={className ?? "w-5 h-auto rounded-sm"} title={lang.toUpperCase()} />;
}
