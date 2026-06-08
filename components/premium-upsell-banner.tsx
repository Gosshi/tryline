"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function PremiumUpsellBanner() {
  const [isPremium, setIsPremium] = useState(true);

  useEffect(() => {
    fetch("/api/me/premium")
      .then((response) => response.json())
      .then((data: { isPremium?: boolean }) =>
        setIsPremium(data.isPremium ?? false),
      )
      .catch(() => setIsPremium(false));
  }, []);

  if (isPremium) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/5 px-5 py-4">
      <p className="text-sm font-semibold text-[var(--color-ink)]">
        日本語レビュー全文は Premium でお読みいただけます
      </p>
      <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
        各試合の詳細分析・プレビュー・AI チャットが月額 ¥980
        で読み放題。
      </p>
      <Link
        className="mt-3 inline-block rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-xs font-bold text-white hover:opacity-90"
        href="/pricing"
      >
        Premium を始める — ¥980/月
      </Link>
    </div>
  );
}
