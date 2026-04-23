"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body className="bg-slate-50">
        <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-start justify-center gap-4 px-6 py-16">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Tryline</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            ページの表示に失敗しました
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            しばらくしてから再読み込みしてください。問題が続く場合は Owner に報告してください。
          </p>
          <Button onClick={reset}>再試行</Button>
          <p className="text-xs text-slate-400">{error.digest ?? "no-digest"}</p>
        </main>
      </body>
    </html>
  );
}
