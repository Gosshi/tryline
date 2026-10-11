"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function AuthErrorNotice() {
  const searchParams = useSearchParams();
  const handledRef = useRef(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (handledRef.current || searchParams.get("auth_error") !== "1") return;
    handledRef.current = true;
    setVisible(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("auth_error");
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );
  }, [searchParams]);

  if (!visible) return null;
  return (
    <div role="alert" className="auth-return-notice">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="font-semibold">ログインできませんでした。</p>
          <p>
            メールのリンクは、メールアドレスを入力したのと同じブラウザで開いてください。リンクの期限が切れている場合は、もう一度ログインしてください。
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md px-2 py-1 text-sm hover:bg-[var(--color-rule)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          onClick={() => setVisible(false)}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
