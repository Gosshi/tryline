import { PaywallViewTracker } from "./paywall-view-tracker";
import { TrackedLink } from "./tracked-link";

import type { ReactNode } from "react";

type PaywallProps = {
  children: ReactNode;
  contentType: string;
  isPremium: boolean;
  matchId?: string;
};

export function Paywall({
  children,
  contentType,
  isPremium,
  matchId,
}: PaywallProps) {
  if (isPremium) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      <PaywallViewTracker contentType={contentType} matchId={matchId} />
      <div className="pointer-events-none select-none blur-sm">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70 px-4 text-center backdrop-blur-sm">
        <p className="text-sm font-semibold text-slate-800">
          試合後の深掘りは Premium で読めます
        </p>
        <TrackedLink
          analytics={{
            cta_id: "paywall_pricing",
            cta_location: "paywall_overlay",
            destination: "pricing",
            label: "7日間無料でレビュー全文を読む",
          }}
          className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          href="/pricing"
        >
          7日間無料でレビュー全文を読む
        </TrackedLink>
      </div>
    </div>
  );
}
