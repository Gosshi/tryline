import Link from "next/link";

import { NoteIcon } from "@/components/icons/note-icon";
import { XIcon } from "@/components/icons/x-icon";

export function SiteFooter() {
  const competitionLinks = [
    { href: "/c/six-nations", label: "Six Nations" },
    { href: "/c/premiership", label: "Premiership" },
    { href: "/c/urc", label: "URC" },
    { href: "/c/top-14", label: "Top 14" },
    { href: "/c/super-rugby-pacific", label: "Super Rugby Pacific" },
    { href: "/c/rugby-championship", label: "Rugby Championship" },
    { href: "/c/pnc", label: "Pacific Nations Cup" },
    { href: "/c/rwc", label: "RWC" },
    { href: "/c/league-one", label: "ジャパンラグビー リーグワン" },
    { href: "/c/autumn-nations", label: "Autumn Nations" },
  ];
  const serviceLinks = [
    { href: "/pricing", label: "料金プラン" },
    { href: "/support", label: "サポート・お問い合わせ" },
    { href: "/legal/privacy", label: "プライバシーポリシー" },
    { href: "/legal/tokusho", label: "特定商取引法に基づく表記" },
    { href: "/legal/terms", label: "利用規約" },
  ];

  return (
    <footer className="mt-16 border-t border-[var(--color-rule)] bg-background">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-8">
        <div className="grid gap-8 sm:grid-cols-[1fr_2fr]">
          <p className="text-sm font-black tracking-tight text-[var(--color-ink)]">
            Tryline
          </p>
          <nav
            aria-label="フッターナビゲーション"
            className="grid gap-8 sm:grid-cols-3"
          >
            <div>
              <h2 className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--color-ink)]">
                大会
              </h2>
              <ul className="mt-3 space-y-2 text-xs text-[var(--color-ink-muted)]">
                {competitionLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      className="hover:text-[var(--color-ink)]"
                      href={link.href}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--color-ink)]">
                サービス
              </h2>
              <ul className="mt-3 space-y-2 text-xs text-[var(--color-ink-muted)]">
                {serviceLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      className="hover:text-[var(--color-ink)]"
                      href={link.href}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--color-ink)]">
                フォロー
              </h2>
              <ul className="mt-3 space-y-2 text-xs text-[var(--color-ink-muted)]">
                <li>
                  <Link
                    className="hover:text-[var(--color-ink)]"
                    href="/rss.xml"
                    rel="alternate"
                    type="application/rss+xml"
                  >
                    RSS
                  </Link>
                </li>
                <li>
                  <a
                    aria-label="X (Twitter) @tryline_rugbyjp"
                    className="flex items-center gap-1.5 hover:text-[var(--color-ink)]"
                    href="https://x.com/tryline_rugbyjp"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                    @tryline_rugbyjp
                  </a>
                </li>
                <li>
                  <a
                    aria-label="note @tryline_rugbyjp"
                    className="flex items-center gap-1.5 hover:text-[var(--color-ink)]"
                    href="https://note.com/tryline_rugbyjp"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <NoteIcon className="h-3.5 w-10" />
                    note @tryline_rugbyjp
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>
        <p className="mt-8 text-xs text-[var(--color-ink-muted)]">
          © {new Date().getFullYear()} Tryline. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
