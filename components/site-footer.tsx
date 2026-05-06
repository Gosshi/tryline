import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-black tracking-tight text-slate-950">
            Tryline
          </p>
          <nav aria-label="フッターナビゲーション">
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
              <li>
                <Link className="hover:text-slate-900" href="/legal/tokusho">
                  特定商取引法に基づく表記
                </Link>
              </li>
              <li>
                <Link className="hover:text-slate-900" href="/legal/privacy">
                  プライバシーポリシー
                </Link>
              </li>
              <li>
                <Link className="hover:text-slate-900" href="/legal/terms">
                  利用規約
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <p className="mt-4 text-xs text-slate-400">
          © {new Date().getFullYear()} Tryline. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
