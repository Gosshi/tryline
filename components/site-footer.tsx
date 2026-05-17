import Link from "next/link";

export function SiteFooter() {
  const competitionLinks = [
    { href: "/c/six-nations", label: "Six Nations" },
    { href: "/c/premiership", label: "Premiership" },
    { href: "/c/urc", label: "URC" },
    { href: "/c/top-14", label: "Top 14" },
    { href: "/c/super-rugby-pacific", label: "Super Rugby Pacific" },
    { href: "/c/rugby-championship", label: "Rugby Championship" },
    { href: "/c/rwc", label: "RWC" },
    { href: "/c/league-one", label: "ジャパンラグビー リーグワン" },
    { href: "/c/autumn-nations", label: "Autumn Nations" },
  ];
  const serviceLinks = [
    { href: "/pricing", label: "料金プラン" },
    { href: "/legal/privacy", label: "プライバシーポリシー" },
    { href: "/legal/tokusho", label: "特定商取引法に基づく表記" },
    { href: "/legal/terms", label: "利用規約" },
  ];

  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-8">
        <div className="grid gap-8 sm:grid-cols-[1fr_2fr]">
          <p className="text-sm font-black tracking-tight text-slate-950">
            Tryline
          </p>
          <nav
            aria-label="フッターナビゲーション"
            className="grid gap-8 sm:grid-cols-2"
          >
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-900">
                大会
              </h2>
              <ul className="mt-3 space-y-2 text-xs text-slate-500">
                {competitionLinks.map((link) => (
                  <li key={link.href}>
                    <Link className="hover:text-slate-900" href={link.href}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-900">
                サービス
              </h2>
              <ul className="mt-3 space-y-2 text-xs text-slate-500">
                {serviceLinks.map((link) => (
                  <li key={link.href}>
                    <Link className="hover:text-slate-900" href={link.href}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>
        <p className="mt-8 text-xs text-slate-400">
          © {new Date().getFullYear()} Tryline. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
