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
    <div className="border-[var(--color-accent)]/20 bg-[var(--color-accent)]/5 rounded-xl border px-5 py-4">
      <p className="text-sm font-semibold text-[var(--color-ink)]">
        試合後の日本語レビュー全文は Premium で読めます
      </p>
      <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
        見逃した海外ラグビーの流れ・勝負どころ・注目選手を月額 ¥980
        で追えます。初回は7日間無料です。
      </p>
      <Link
        className="mt-3 inline-block rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-xs font-bold text-white hover:opacity-90"
        href="/pricing"
      >
        7日間無料でレビュー全文を読む
      </Link>
    </div>
  );
}
