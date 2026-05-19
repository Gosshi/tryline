import Link from "next/link";

type LangToggleProps = {
  currentLang: "ja" | "en";
  matchId: string;
};

export function LangToggle({ currentLang, matchId }: LangToggleProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-0.5 text-xs font-semibold shadow-sm shadow-slate-200/50">
      <Link
        aria-current={currentLang === "ja" ? "page" : undefined}
        className={[
          "rounded-full px-3 py-1 transition-colors",
          currentLang === "ja"
            ? "bg-[var(--color-ink)] text-white"
            : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
        ].join(" ")}
        href={`/matches/${matchId}`}
      >
        JP
      </Link>
      <Link
        aria-current={currentLang === "en" ? "page" : undefined}
        className={[
          "rounded-full px-3 py-1 transition-colors",
          currentLang === "en"
            ? "bg-[var(--color-ink)] text-white"
            : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
        ].join(" ")}
        href={`/matches/${matchId}/en`}
      >
        EN
      </Link>
    </div>
  );
}
