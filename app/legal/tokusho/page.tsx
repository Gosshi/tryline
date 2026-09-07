import { TokushoDisclosure } from "@/components/tokusho-disclosure";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表示",
};

export default function TokushoPage() {
  return (
    <article className="space-y-8 text-[var(--color-ink)]">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">
          Legal
        </p>
        <h1 className="text-3xl font-bold tracking-normal">
          特定商取引法に基づく表示
        </h1>
      </header>
      <TokushoDisclosure />
    </article>
  );
}
