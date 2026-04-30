import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 md:px-8">
        <Link
          className="flex items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          href="/"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-lg font-black tracking-tight text-slate-950">
            Tryline
          </span>
        </Link>

        <div />
      </div>
    </header>
  );
}
