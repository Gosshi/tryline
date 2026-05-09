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
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-700">
          応援チームを登録すると、トップページに試合を優先表示できます。
        </p>
        <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
          <span className="text-xs text-slate-500">
            ヘッダーのメニューから設定できます
          </span>
          <button
            aria-label="バナーを閉じる"
            className="rounded p-1 text-slate-400 hover:bg-white/70 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            onClick={dismiss}
            type="button"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
