import type { ReactNode } from "react";

type PaywallProps = {
  children: ReactNode;
  isPremium: boolean;
};

export function Paywall({ children, isPremium }: PaywallProps) {
  if (isPremium) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="pointer-events-none select-none blur-sm">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70 px-4 text-center backdrop-blur-sm">
        <p className="text-sm font-semibold text-slate-800">
          試合後の深掘りは Premium で読めます
        </p>
        <a
          className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          href="/pricing"
        >
          7日間無料でレビュー全文を読む
        </a>
      </div>
    </div>
  );
}
