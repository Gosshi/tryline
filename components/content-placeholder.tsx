type ContentPlaceholderProps = {
  type: "preview" | "recap";
  state: "pre_window" | "preparing" | "unavailable";
};

const COPY: Record<
  ContentPlaceholderProps["type"],
  Record<ContentPlaceholderProps["state"], string>
> = {
  preview: {
    pre_window: "プレビューは試合開始 48 時間前に公開予定",
    preparing: "プレビューを準備中です",
    unavailable: "このプレビューは公開されませんでした",
  },
  recap: {
    pre_window: "レビューは試合終了 1 時間後に公開予定",
    preparing: "レビューを準備中です",
    unavailable: "このレビューは公開されませんでした",
  },
};

const ICON: Record<ContentPlaceholderProps["state"], string> = {
  pre_window: "🕐",
  preparing: "⏳",
  unavailable: "—",
};

export function ContentPlaceholder({ state, type }: ContentPlaceholderProps) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-5 py-5">
      <div className="flex items-center gap-2">
        <span aria-hidden className="shrink-0 text-base leading-none" role="img">
          {ICON[state]}
        </span>
        <p className="text-sm font-medium text-[var(--color-ink)]">
          {COPY[type][state]}
        </p>
      </div>
      {state !== "unavailable" && (
        <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
          コンテンツは自動生成されます。しばらくお待ちください。
        </p>
      )}
    </div>
  );
}
