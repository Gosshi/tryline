import { BulkFactPasteForm } from "@/app/ops/facts/bulk-fact-paste-form";
import { requireOpsOwner } from "@/lib/auth/ops";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tryline",
  robots: { index: false, follow: false },
};
export default async function OpsFactsPage() {
  await requireOpsOwner();
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8 text-[var(--color-ink)]">
      <h1 className="text-2xl font-bold">調査事実の一括入力</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        試合 URL を含む見出しごとに読み取り、DB の試合と照合してから保存します。
      </p>
      <BulkFactPasteForm />
    </main>
  );
}
