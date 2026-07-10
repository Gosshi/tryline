"use client";

import { useEffect, useState } from "react";

const BANNER_KEY = "favorite_teams_banner_dismissed";

export function FavoriteTeamsBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem(BANNER_KEY)) {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    sessionStorage.setItem(BANNER_KEY, "1");
    setVisible(false);
  }

  if (!visible) {
    return null;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 md:px-8">
      <div className="relative overflow-hidden rounded-2xl border border-[var(--color-accent)]/35 bg-white px-5 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--color-accent)]">
              Follow your team
            </p>
            <h2 className="mt-1 text-xl font-black text-[var(--color-ink)]">
              応援チームを登録して、次の試合を逃さない
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">
              登録したチームの試合をトップページに優先表示します。ヘッダーのユーザーメニューから最大3チームまで選べます。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-xs font-bold text-white">
              このチームを応援する
            </span>
            <button
              aria-label="バナーを閉じる"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              onClick={dismiss}
              type="button"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
