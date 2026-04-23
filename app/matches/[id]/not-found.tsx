import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function MatchNotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-start justify-center gap-4 px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Tryline</p>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">試合が見つかりません</h1>
      <p className="text-sm leading-6 text-slate-600">
        指定された試合 ID は存在しないか、公開対象ではありません。
      </p>
      <Button asChild>
        <Link href="/">一覧に戻る</Link>
      </Button>
    </main>
  );
}
